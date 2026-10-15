//! reflex-agent binary — CLI entry point for the ReflexWork Reflex Kernel.
//!
//! Usage:
//!   reflex-agent --config reflex-kernel.toml
//!   reflex-agent process --task '{"category":"DataQuery","raw_input":"...",...}'
//!   reflex-agent register-agent
//!   reflex-agent status

use std::process;

use reflex_kernel::{KernelConfig, ReflexKernel};
use tracing::{error, info};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() {
    // Initialize structured logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("reflex_kernel=debug".parse().unwrap()))
        .init();

    info!("ReflexWork Agent v{}", env!("CARGO_PKG_VERSION"));

    let args: Vec<String> = std::env::args().collect();
    let config_path = args
        .windows(2)
        .find(|w| w[0] == "--config")
        .map(|w| w[1].as_str())
        .unwrap_or("reflex-kernel.toml");

    let config = if std::path::Path::new(config_path).exists() {
        match KernelConfig::from_file(config_path) {
            Ok(c) => {
                info!("Loaded config from {config_path}");
                c
            }
            Err(e) => {
                error!("Failed to load config: {e}");
                process::exit(1);
            }
        }
    } else {
        info!("Config file not found, using devnet defaults");
        KernelConfig::default_devnet()
    };

    let kernel = ReflexKernel::new(config);
    info!(
        feature_dim = kernel.config.policy.feature_dim,
        gate_threshold = kernel.config.policy.gate_threshold,
        rpc_url = %kernel.config.solana.rpc_url,
        "Reflex Kernel initialized"
    );

    let subcommand = args.get(1).map(|s| s.as_str()).unwrap_or("help");
    match subcommand {
        "status" => {
            let policy = kernel.policy.lock().await;
            println!("Policy version:         {}", policy.version);
            println!("Gate threshold:         {}", policy.gate_threshold);
            println!("EMA alpha:              {}", policy.ema_alpha);
            println!("Tasks processed:        {}", policy.total_tasks_processed);
            println!("Fast-path count:        {}", policy.total_fast_path);
            println!("LLM invocation count:   {}", policy.total_llm_invocations);
            println!("RPC URL:                {}", kernel.config.solana.rpc_url);
        }

        "route" => {
            use reflex_kernel::types::{TaskCategory, TaskSpec};
            use uuid::Uuid;

            // ── Parse optional --category and --input flags ──────────────────
            let flag = |name: &str| -> Option<String> {
                args.windows(2).find(|w| w[0] == name).map(|w| w[1].clone())
            };
            let category = match flag("--category").as_deref() {
                Some("DocumentParse")         => TaskCategory::DocumentParse,
                Some("CodeGen")               => TaskCategory::CodeGen,
                Some("DataQuery")             => TaskCategory::DataQuery,
                Some("WorkflowOrchestration") => TaskCategory::WorkflowOrchestration,
                Some("ComplianceCheck")       => TaskCategory::ComplianceCheck,
                Some("Research")              => TaskCategory::Research,
                Some(other)                   => TaskCategory::Custom(other.to_string()),
                None                          => TaskCategory::DataQuery,
            };
            let raw_input = flag("--input")
                .unwrap_or_else(|| "Check that the student request form has all required fields.".to_string());

            let task = TaskSpec {
                id: Uuid::new_v4(),
                category: category.clone(),
                raw_input: raw_input.clone(),
                token_budget: 2048,
                deadline_unix_ns: 0,
                priority: 128,
                context_tags: raw_input
                    .split_whitespace()
                    .take(5)
                    .map(|s| s.to_lowercase())
                    .collect(),
                requester_pubkey: None,
                workflow_id: None,
            };

            // ── Route through the kernel (no Solana, no LLM) ─────────────────
            let (route, attest) = match kernel.process(&task).await {
                Ok(r) => r,
                Err(e) => { error!("Kernel route failed: {e}"); process::exit(1); }
            };

            println!("\n── Reflex Kernel — Route Decision ──────────────────────────");
            println!("Task category : {:?}", category);
            println!("Input         : {raw_input}");
            println!("Route         : {:?}", route);
            println!("Kernel latency: {} ns ({:.1} µs)", attest.execution_ns, attest.execution_ns as f64 / 1000.0);
            println!("BLAKE3 proof  : {}", hex::encode(attest.composite_hash));
            println!("Token cost    : {}", match route {
                reflex_kernel::RouteDecision::FastPath => "0 tokens (deterministic — no LLM)",
                _ => "budgeted (LLM path via Kiro MCP)",
            });
            println!("──────────────────────────────────────────────────────────");
            println!("Audit note: re-running this task yields the SAME BLAKE3 proof (reproducible).");
        }

        "register-agent" => {
            info!("Registering agent onchain...");
            let client = reflex_kernel::solana::AnchorClient::new(
                &kernel.config.solana.rpc_url,
                &kernel.config.solana.program_id,
                &kernel.config.solana.keypair_path,
                &kernel.config.solana.commitment,
            );
            match client.register_agent().await {
                Ok(result) => info!("Agent registered. Tx: {} PDA: {}", result.signature, result.agent_record_pda),
                Err(e)  => error!("Registration failed: {e}"),
            }
        }

        "smoke-test" => {
            use reflex_kernel::{
                types::{TaskCategory, TaskSpec},
                solana::AnchorClient,
            };
            use uuid::Uuid;

            info!("=== ReflexWork End-to-End Smoke Test ===");
            info!("S1: Reflex Kernel → route decision + BLAKE3 attestation");
            info!("S3: Anchor devnet  → initialize_workflow + submit_execution_proof");

            // ── Step 1: Build a sample task ──────────────────────────────────
            let workflow_id = Uuid::new_v4();
            let task = TaskSpec {
                id:               Uuid::new_v4(),
                category:         TaskCategory::OnchainSettlement,
                raw_input:        "Settle bounty for completed AI workflow execution".to_string(),
                token_budget:     1,       // fast-path: budget set but no tokens consumed
                deadline_unix_ns: 0,
                priority:         200,
                context_tags:     vec!["solana".to_string(), "settlement".to_string()],
                requester_pubkey: None,
                workflow_id:      Some(workflow_id),
            };
            info!(task_id = %task.id, category = ?task.category, "Task created");

            // ── Step 2: Reflex Kernel processes the task (S1) ────────────────
            let start = std::time::Instant::now();
            let (route, attest) = match kernel.process(&task).await {
                Ok(r) => r,
                Err(e) => { error!("Kernel process failed: {e}"); process::exit(1); }
            };
            let kernel_ns = start.elapsed().as_nanos();
            info!(
                route = ?route,
                composite_hash = hex::encode(attest.composite_hash),
                kernel_ns,
                "S1 complete — Reflex Kernel routed task"
            );
            println!("\n[S1] Route decision : {:?}", route);
            println!("[S1] Kernel latency : {} ns ({:.1} µs)", kernel_ns, kernel_ns as f64 / 1000.0);
            println!("[S1] Composite hash : {}", hex::encode(attest.composite_hash));

            // ── Step 3: Initialize escrow on devnet (S3) ─────────────────────
            let client = AnchorClient::new(
                &kernel.config.solana.rpc_url,
                &kernel.config.solana.program_id,
                &kernel.config.solana.keypair_path,
                &kernel.config.solana.commitment,
            );

            // Derive depositor pubkey from keypair
            let keypair_path = &kernel.config.solana.keypair_path;
            let expanded_path = shellexpand::tilde(keypair_path).into_owned();
            use solana_keypair::read_keypair_file;
            use solana_signer::Signer;
            let depositor_kp = read_keypair_file(&expanded_path)
                .map_err(|e| { error!("Read keypair: {e}"); process::exit(1) })
                .unwrap();
            let depositor_pk = depositor_kp.pubkey();

            let deadline_unix_s = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64 + 300; // 5 min deadline

            let task_spec_hash = attest.composite_hash; // reuse composite hash as task spec hash

            info!(workflow_id = %workflow_id, "Initializing workflow escrow on devnet...");
            let init_sig = match client
                .initialize_workflow(workflow_id, 10_000, deadline_unix_s, task_spec_hash, 1, None)
                .await
            {
                Ok(sig) => sig,
                Err(e)  => { error!("initialize_workflow failed: {e}"); process::exit(1); }
            };
            println!("[S3] WorkflowEscrow initialized");
            println!("[S3] Init tx         : https://explorer.solana.com/tx/{}?cluster=devnet", init_sig);

            // ── Step 4: Submit execution proof (S3) ──────────────────────────
            info!("Submitting execution proof to devnet...");
            let proof_result = match client
                .submit_execution_proof(&attest, &depositor_pk, workflow_id)
                .await
            {
                Ok(r)  => r,
                Err(e) => { error!("submit_execution_proof failed: {e}"); process::exit(1); }
            };
            println!("[S3] Proof submitted");
            println!("[S3] Proof tx        : https://explorer.solana.com/tx/{}?cluster=devnet", proof_result.signature);
            println!("[S3] Attestation PDA : {}", proof_result.attestation_pda);
            println!("\n✅ End-to-end smoke test PASSED");
            println!("   S1 (Reflex Kernel) → S3 (Anchor devnet) — no LLM invoked");
        }

        "help" | _ => {
            println!("reflex-agent — ReflexWork Reflex Kernel");
            println!();
            println!("USAGE:");
            println!("  reflex-agent [--config <path>] <subcommand>");
            println!();
            println!("SUBCOMMANDS:");
            println!("  status           Print current policy state");
            println!("  route            Route one task → decision + BLAKE3 proof (local, no Solana)");
            println!("                     e.g. route --category ComplianceCheck --input \"...\"");
            println!("  register-agent   Register agent onchain (one-time setup)");
            println!("  smoke-test       End-to-end S1→S3 smoke test on devnet (optional on-chain variant)");
            println!("  help             Show this message");
        }
    }
}
