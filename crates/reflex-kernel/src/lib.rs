//! # reflex-kernel
//!
//! Modelless Reflex Engine for ReflexWork.
//!
//! Provides sub-millisecond deterministic task routing via sigmoid-gated policy vectors,
//! BLAKE3 state attestation, and online EMA weight adaptation — zero marginal token cost.
//!
//! ## Architecture
//!
//! ```text
//! TaskSpec → FeatureEncoder → PolicyRouter → BudgetController → StateAttestor → RouteDecision
//! ```
//!
//! ## Feature Layout (N=64 dimensions)
//! ```text
//! [0..8]   task category one-hot
//! [8..16]  normalized complexity score
//! [16..24] remaining token budget fraction
//! [24..32] time-to-deadline fraction
//! [32..48] context tag TF features
//! [48..64] zero-padded
//! ```

pub mod attestation;
pub mod budget;
pub mod config;
pub mod encoder;
pub mod error;
pub mod mcp;
pub mod policy;
pub mod solana;
pub mod types;

pub use attestation::{StateAttestation, StateAttestor};
pub use budget::BudgetController;
pub use config::KernelConfig;
pub use encoder::FeatureEncoder;
pub use error::KernelError;
pub use mcp::McpClient;
pub use policy::{PersonalitySnapshot, PolicyRouter, PolicyState, RouteDecision};
pub use types::{TaskCategory, TaskSpec};

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// The top-level Reflex Kernel orchestrator.
///
/// Holds all subsystems behind shared-ownership pointers so it can be
/// cloned cheaply and used concurrently across async tasks.
pub struct ReflexKernel {
    pub config: KernelConfig,
    pub policy: Arc<Mutex<PolicyState>>,
    pub encoder: FeatureEncoder,
    pub budget: Arc<Mutex<BudgetController>>,
    pub attestor: StateAttestor,
    pub mcp: Option<McpClient>,
}

impl ReflexKernel {
    /// Construct a new kernel from config. Does not start the MCP process.
    pub fn new(config: KernelConfig) -> Self {
        let policy = PolicyState::new(
            config.policy.feature_dim,
            config.policy.gate_threshold,
            config.policy.ema_alpha,
        );
        let encoder = FeatureEncoder::new(config.policy.feature_dim);
        let budget = BudgetController::new(
            config.budget.default_token_budget,
            config.budget.hard_deadline_ms,
        );

        Self {
            config,
            policy: Arc::new(Mutex::new(policy)),
            encoder,
            budget: Arc::new(Mutex::new(budget)),
            attestor: StateAttestor::default(),
            mcp: None,
        }
    }

    /// Process a single `TaskSpec` and return a `RouteDecision` with attestation.
    pub async fn process(&self, task: &TaskSpec) -> Result<(RouteDecision, StateAttestation), KernelError> {
        let start = std::time::Instant::now();

        // 1. Encode task into feature vector
        let x = self.encoder.encode(task)?;

        // 2. Compute gate score and route decision
        let route = {
            let policy = self.policy.lock().await;
            PolicyRouter::route(&x, &policy)?
        };

        // 3. Check budget constraints
        {
            let budget = self.budget.lock().await;
            budget.check(task)?;
        }

        // 4. Snapshot current policy state for attestation
        let snapshot = {
            let policy = self.policy.lock().await;
            PersonalitySnapshot::from_policy(&policy, &self.config.blake3.environment_tag)
        };

        // 5. Build state attestation
        let attest = self.attestor.attest(&snapshot, task, &route, start.elapsed().as_nanos() as u64)?;

        info!(
            task_id = %task.id,
            route = ?route,
            exec_ns = attest.execution_ns,
            "reflex-kernel: task routed"
        );

        Ok((route, attest))
    }

    /// Apply EMA reward update after task outcome is known.
    pub async fn update_policy(&self, task: &TaskSpec, reward: f32) -> Result<(), KernelError> {
        let x = self.encoder.encode(task)?;
        let mut policy = self.policy.lock().await;
        policy.ema_update(&x, reward);
        Ok(())
    }
}
