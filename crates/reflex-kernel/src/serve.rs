//! reflex-serve — REST API wrapping the Reflex Kernel.
//!
//! Exposes the kernel's routing decision over HTTP so any upstream system
//! (a department's request portal, a REST client, a dashboard) can submit a
//! task and get back a route decision + BLAKE3 proof — with zero LLM/Solana
//! coupling. The LLM path is still decided here; actually invoking Bedrock is
//! handled by the MCP layer downstream.
//!
//! Endpoints:
//!   GET  /health            → liveness probe
//!   GET  /status            → current policy state
//!   POST /route             → route one task, return decision + BLAKE3 proof
//!
//! Usage:
//!   reflex-serve                      # binds 127.0.0.1:8787
//!   PORT=9000 reflex-serve            # custom port
//!
//! Bind address is ALWAYS 127.0.0.1 (localhost only) by design.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};
use uuid::Uuid;

use reflex_kernel::{
    types::{TaskCategory, TaskSpec},
    KernelConfig, ReflexKernel, RouteDecision,
};

/// One recorded routing decision, kept in a bounded in-memory ring for the
/// executive dashboard's audit view.
#[derive(Debug, Clone, Serialize)]
struct AuditEntry {
    task_id: String,
    category: String,
    route: String,
    fast_path: bool,
    kernel_us: f64,
    blake3_proof: String,
    at_unix_ms: u128,
}

/// Rolling counters + recent audit entries.
#[derive(Default)]
struct Metrics {
    total: u64,
    fast_path: u64,
    llm_path: u64,
    rejected: u64,
    recent: Vec<AuditEntry>, // newest-last, capped
}

/// Shared application state: one kernel + metrics.
#[derive(Clone)]
struct AppState {
    kernel: Arc<ReflexKernel>,
    metrics: Arc<Mutex<Metrics>>,
}

// ─── Request / Response DTOs ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RouteRequest {
    /// Task category, e.g. "ComplianceCheck", "DataQuery", "DocumentParse".
    /// Unknown values map to Custom(..).
    category: Option<String>,
    /// Raw task text (natural language or structured).
    input: String,
    /// Optional token budget for the LLM path (default 2048).
    #[serde(default = "default_budget")]
    token_budget: u32,
    /// Optional priority 0–255 (default 128).
    #[serde(default = "default_priority")]
    priority: u8,
}

fn default_budget() -> u32 {
    2048
}
fn default_priority() -> u8 {
    128
}

#[derive(Debug, Serialize)]
struct RouteResponse {
    task_id: String,
    category: String,
    route: String,
    /// True when the task bypassed the LLM entirely (zero token cost).
    fast_path: bool,
    kernel_ns: u64,
    kernel_us: f64,
    /// BLAKE3 composite hash — the reproducible audit proof.
    blake3_proof: String,
    token_cost: String,
    audit_note: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
}

async fn status(State(st): State<AppState>) -> impl IntoResponse {
    let p = st.kernel.policy.lock().await;
    let m = st.metrics.lock().await;
    Json(serde_json::json!({
        "policy_version": p.version,
        "gate_threshold": p.gate_threshold,
        "ema_alpha": p.ema_alpha,
        "total_routed": m.total,
        "fast_path": m.fast_path,
        "llm_path": m.llm_path,
        "rejected": m.rejected,
        "fast_path_pct": if m.total > 0 { (m.fast_path as f64 / m.total as f64 * 100.0).round() } else { 0.0 },
    }))
}

async fn audit(State(st): State<AppState>) -> impl IntoResponse {
    let m = st.metrics.lock().await;
    // newest first
    let mut entries = m.recent.clone();
    entries.reverse();
    Json(serde_json::json!({ "entries": entries }))
}

fn parse_category(raw: Option<&str>) -> TaskCategory {
    match raw {
        Some("DocumentParse") => TaskCategory::DocumentParse,
        Some("CodeGen") => TaskCategory::CodeGen,
        Some("DataQuery") => TaskCategory::DataQuery,
        Some("WorkflowOrchestration") => TaskCategory::WorkflowOrchestration,
        Some("ComplianceCheck") => TaskCategory::ComplianceCheck,
        Some("Research") => TaskCategory::Research,
        Some(other) => TaskCategory::Custom(other.to_string()),
        None => TaskCategory::DataQuery,
    }
}

async fn route(
    State(st): State<AppState>,
    Json(req): Json<RouteRequest>,
) -> impl IntoResponse {
    if req.input.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "field `input` must not be empty".into() }),
        )
            .into_response();
    }

    let category = parse_category(req.category.as_deref());
    let context_tags: Vec<String> = req
        .input
        .split_whitespace()
        .take(5)
        .map(|s| s.to_lowercase())
        .collect();

    let task = TaskSpec {
        id: Uuid::new_v4(),
        category: category.clone(),
        raw_input: req.input.clone(),
        token_budget: req.token_budget,
        deadline_unix_ns: 0,
        priority: req.priority,
        context_tags,
        requester_pubkey: None,
        workflow_id: None,
    };

    match st.kernel.process(&task).await {
        Ok((route, attest)) => {
            let fast_path = matches!(route, RouteDecision::FastPath);
            let token_cost = if fast_path {
                "0 tokens (deterministic — no LLM)".to_string()
            } else {
                "budgeted (LLM path via Kiro MCP)".to_string()
            };
            let proof = hex::encode(attest.composite_hash);

            // Record into metrics + bounded audit ring (cap 50).
            {
                let mut m = st.metrics.lock().await;
                m.total += 1;
                match &route {
                    RouteDecision::FastPath => m.fast_path += 1,
                    RouteDecision::Rejected { .. } => m.rejected += 1,
                    _ => m.llm_path += 1,
                }
                let at_unix_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                m.recent.push(AuditEntry {
                    task_id: task.id.to_string(),
                    category: format!("{category:?}"),
                    route: format!("{route:?}"),
                    fast_path,
                    kernel_us: attest.execution_ns as f64 / 1000.0,
                    blake3_proof: proof.clone(),
                    at_unix_ms,
                });
                if m.recent.len() > 50 {
                    let overflow = m.recent.len() - 50;
                    m.recent.drain(0..overflow);
                }
            }

            info!(task_id = %task.id, route = ?route, exec_ns = attest.execution_ns, "routed via REST");
            Json(RouteResponse {
                task_id: task.id.to_string(),
                category: format!("{category:?}"),
                route: format!("{route:?}"),
                fast_path,
                kernel_ns: attest.execution_ns,
                kernel_us: attest.execution_ns as f64 / 1000.0,
                blake3_proof: proof,
                token_cost,
                audit_note: "re-running this task yields the SAME BLAKE3 proof (reproducible)".into(),
            })
            .into_response()
        }
        Err(e) => {
            warn!("kernel route failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("kernel error: {e}") }),
            )
                .into_response()
        }
    }
}

// ─── Feedback (self-learning: 👍/👎 → EMA weight update) ──────────────────────

#[derive(Debug, Deserialize)]
struct FeedbackRequest {
    category: Option<String>,
    input: String,
    /// Reward signal: +1.0 for 👍 (answer was good), -1.0 for 👎 (answer was wrong).
    reward: f32,
}

#[derive(Debug, Serialize)]
struct FeedbackResponse {
    accepted: bool,
    /// Policy version AFTER the update — increments on every applied feedback.
    policy_version: u32,
    note: String,
}

/// Apply user feedback to the policy via EMA. A 👍 on a FastPath answer
/// reinforces keeping similar tasks on the fast (zero-token) path; a 👎 nudges
/// the gate toward escalating similar tasks to the LLM. This is the loop that
/// makes the kernel learn which questions genuinely need AI.
async fn feedback(
    State(st): State<AppState>,
    Json(req): Json<FeedbackRequest>,
) -> impl IntoResponse {
    if req.input.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "field `input` must not be empty".into() }),
        )
            .into_response();
    }
    let reward = req.reward.clamp(-1.0, 1.0);
    let category = parse_category(req.category.as_deref());
    let context_tags: Vec<String> = req
        .input
        .split_whitespace()
        .take(5)
        .map(|s| s.to_lowercase())
        .collect();
    let task = TaskSpec {
        id: Uuid::new_v4(),
        category,
        raw_input: req.input.clone(),
        token_budget: 2048,
        deadline_unix_ns: 0,
        priority: 128,
        context_tags,
        requester_pubkey: None,
        workflow_id: None,
    };

    match st.kernel.encoder.encode(&task) {
        Ok(x) => {
            let version = {
                let mut p = st.kernel.policy.lock().await;
                p.ema_update(&x, reward);
                p.version
            };
            info!(reward, policy_version = version, "feedback applied → EMA update");
            Json(FeedbackResponse {
                accepted: true,
                policy_version: version,
                note: "policy updated via EMA; the gate adapts to this feedback".into(),
            })
            .into_response()
        }
        Err(e) => {
            warn!("feedback encode failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("encode error: {e}") }),
            )
                .into_response()
        }
    }
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "reflex_serve=info,reflex_kernel=info".into()),
        )
        .init();

    // Config: reuse the kernel's devnet defaults (Solana fields unused by the REST path).
    let config = KernelConfig::default_devnet();
    let kernel = Arc::new(ReflexKernel::new(config));
    let state = AppState {
        kernel,
        metrics: Arc::new(Mutex::new(Metrics::default())),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/audit", get(audit))
        .route("/route", post(route))
        .route("/feedback", post(feedback))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Localhost only, explicit bind address (never 0.0.0.0).
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let addr = format!("127.0.0.1:{port}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));

    info!("reflex-serve listening on http://{addr}");
    info!("  GET  /health   GET /status   POST /route   POST /feedback");

    axum::serve(listener, app)
        .await
        .expect("server error");
}
