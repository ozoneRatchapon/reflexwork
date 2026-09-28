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

        "register-agent" => {
            info!("Registering agent onchain...");
            let client = reflex_kernel::solana::AnchorClient::new(
                &kernel.config.solana.rpc_url,
                &kernel.config.solana.program_id,
                &kernel.config.solana.keypair_path,
                &kernel.config.solana.commitment,
            );
            match client.register_agent().await {
                Ok(sig) => info!("Agent registered. Tx: {sig}"),
                Err(e)  => error!("Registration failed: {e}"),
            }
        }

        "help" | _ => {
            println!("reflex-agent — ReflexWork Reflex Kernel");
            println!();
            println!("USAGE:");
            println!("  reflex-agent [--config <path>] <subcommand>");
            println!();
            println!("SUBCOMMANDS:");
            println!("  status           Print current policy state");
            println!("  register-agent   Register agent onchain (one-time setup)");
            println!("  help             Show this message");
        }
    }
}
