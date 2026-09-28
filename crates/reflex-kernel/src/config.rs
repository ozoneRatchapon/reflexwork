//! Kernel configuration, loaded from `reflex-kernel.toml`.

use serde::{Deserialize, Serialize};

use crate::error::KernelError;

/// Top-level kernel configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KernelConfig {
    pub policy:  PolicyConfig,
    pub budget:  BudgetConfig,
    pub blake3:  Blake3Config,
    pub solana:  SolanaConfig,
    pub mcp:     McpConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub feature_dim:    usize,
    pub gate_threshold: f32,
    pub ema_alpha:      f32,
    pub snapshot_path:  String,
    pub auto_persist:   bool,
    pub persist_every:  u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetConfig {
    pub default_token_budget: u32,
    pub hard_deadline_ms:     u64,
    pub cost_per_llm_call:    u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake3Config {
    pub encoding:       String,   // "bincode-le"
    pub environment_tag: String,  // e.g. "devnet-v1"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolanaConfig {
    pub rpc_url:    String,
    pub program_id: String,
    pub commitment: String,
    pub keypair_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    /// Command to spawn the MCP server process.
    pub command: String,
    /// Arguments passed to the MCP server command.
    pub args: Vec<String>,
}

impl KernelConfig {
    /// Load config from a TOML file path.
    pub fn from_file(path: &str) -> Result<Self, KernelError> {
        let content = std::fs::read_to_string(path)?;
        toml::from_str(&content).map_err(|e| KernelError::Config(e.to_string()))
    }

    /// Return a sensible default config for development / CI.
    pub fn default_devnet() -> Self {
        Self {
            policy: PolicyConfig {
                feature_dim:    64,
                gate_threshold: 0.72,
                ema_alpha:      0.97,
                snapshot_path:  "~/.reflexwork/policy-snapshot.bin".into(),
                auto_persist:   true,
                persist_every:  100,
            },
            budget: BudgetConfig {
                default_token_budget: 4096,
                hard_deadline_ms:     2000,
                cost_per_llm_call:    500,
            },
            blake3: Blake3Config {
                encoding:        "bincode-le".into(),
                environment_tag: "devnet-v1".into(),
            },
            solana: SolanaConfig {
                rpc_url:      "https://api.devnet.solana.com".into(),
                program_id:   "REFLEXWORK_PLACEHOLDER_111111111111111111111111".into(),
                commitment:   "confirmed".into(),
                keypair_path: "~/.config/solana/id.json".into(),
            },
            mcp: McpConfig {
                command: "node".into(),
                args:    vec!["dist/mcp-server/index.js".into()],
            },
        }
    }
}
