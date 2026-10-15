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
use tower_http::cors::CorsLayer;
use tracing::{info, warn};
use uuid::Uuid;

use reflex_kernel::{
    types::{TaskCategory, TaskSpec},
    KernelConfig, ReflexKernel, RouteDecision,
};

/// Shared application state: one kernel behind an Arc.
#[derive(Clone)]
struct AppState {
    kernel: Arc<ReflexKernel>,
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
struct StatusResponse {
    policy_version: u32,
    gate_threshold: f32,
    ema_alpha: f32,
    tasks_processed: u64,
    fast_path_count: u64,
    llm_invocation_count: u64,
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
    Json(StatusResponse {
        policy_version: p.version,
        gate_threshold: p.gate_threshold,
        ema_alpha: p.ema_alpha,
        tasks_processed: p.total_tasks_processed,
        fast_path_count: p.total_fast_path,
        llm_invocation_count: p.total_llm_invocations,
    })
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
            info!(task_id = %task.id, route = ?route, exec_ns = attest.execution_ns, "routed via REST");
            Json(RouteResponse {
                task_id: task.id.to_string(),
                category: format!("{category:?}"),
                route: format!("{route:?}"),
                fast_path,
                kernel_ns: attest.execution_ns,
                kernel_us: attest.execution_ns as f64 / 1000.0,
                blake3_proof: hex::encode(attest.composite_hash),
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
    let state = AppState { kernel };

    let app = Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/route", post(route))
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
    info!("  GET  /health   GET /status   POST /route");

    axum::serve(listener, app)
        .await
        .expect("server error");
}
