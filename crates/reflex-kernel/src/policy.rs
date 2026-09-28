//! Policy engine: sigmoid gate, softmax routing, EMA weight updates.
//!
//! # Math Reference
//!
//! Binary gate:
//!   g = σ(wᵀx + b),  σ(z) = 1 / (1 + e^{-z})
//!   route = LLM if g ≥ θ_gate, else FastPath
//!
//! Multi-class softmax:
//!   logits = W·x + b_vec
//!   P(k|x) = exp(logits_k) / Σⱼ exp(logits_j)
//!   route* = argmax_k P(k|x)
//!
//! EMA reward update:
//!   w_new = α·w + (1-α)·(r·x)

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::KernelError, types::TaskSpec};

/// Number of route classes for multi-class routing.
pub const ROUTE_CLASSES: usize = 4;

// ─── Policy State ─────────────────────────────────────────────────────────────

/// In-memory policy state. Serializable for persistence and BLAKE3 attestation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyState {
    /// Monotonically increasing version number.
    pub version: u32,

    /// Binary gate weight vector w ∈ ℝᴺ.
    pub weights: Vec<f32>,

    /// Binary gate bias term b ∈ ℝ.
    pub bias: f32,

    /// EMA decay coefficient α (default: 0.97).
    pub ema_alpha: f32,

    /// Routing threshold θ_gate (default: 0.72).
    pub gate_threshold: f32,

    /// Multi-class routing weights W ∈ ℝ^{K×N} (flattened row-major).
    pub multi_weights: Vec<f32>,

    /// Multi-class bias vector b_vec ∈ ℝᴷ.
    pub multi_bias: Vec<f32>,

    pub total_tasks_processed: u64,
    pub total_fast_path: u64,
    pub total_llm_invocations: u64,
    pub last_updated_unix_ns: u64,
}

impl PolicyState {
    pub const DEFAULT_ALPHA: f32 = 0.97;
    pub const DEFAULT_THETA: f32 = 0.72;

    /// Initialize a new policy with zero weights (cold start).
    pub fn new(feature_dim: usize, gate_threshold: f32, ema_alpha: f32) -> Self {
        Self {
            version: 0,
            weights: vec![0.0f32; feature_dim],
            bias: 0.0,
            ema_alpha,
            gate_threshold,
            multi_weights: vec![0.0f32; ROUTE_CLASSES * feature_dim],
            multi_bias: vec![0.0f32; ROUTE_CLASSES],
            total_tasks_processed: 0,
            total_fast_path: 0,
            total_llm_invocations: 0,
            last_updated_unix_ns: now_unix_ns(),
        }
    }

    /// Apply EMA reward update: w_new = α·w + (1-α)·(r·x)
    pub fn ema_update(&mut self, x: &[f32], reward: f32) {
        let alpha = self.ema_alpha;
        let scale = (1.0 - alpha) * reward;
        for (wi, xi) in self.weights.iter_mut().zip(x.iter()) {
            *wi = alpha * (*wi) + scale * xi;
        }
        self.version = self.version.wrapping_add(1);
        self.last_updated_unix_ns = now_unix_ns();
    }

    pub fn feature_dim(&self) -> usize {
        self.weights.len()
    }
}

// ─── Personality Snapshot ─────────────────────────────────────────────────────

/// Frozen snapshot of PolicyState for BLAKE3 commitment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalitySnapshot {
    pub snapshot_id: Uuid,
    pub policy: PolicyState,
    pub created_at_unix_ns: u64,
    pub environment_tag: String,
}

impl PersonalitySnapshot {
    pub fn from_policy(policy: &PolicyState, env_tag: &str) -> Self {
        Self {
            snapshot_id: Uuid::new_v4(),
            policy: policy.clone(),
            created_at_unix_ns: now_unix_ns(),
            environment_tag: env_tag.to_owned(),
        }
    }
}

// ─── Route Decision ───────────────────────────────────────────────────────────

/// The routing outcome produced by the PolicyRouter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteDecision {
    /// Deterministic fast path — submit directly to Anchor, no LLM.
    FastPath,
    /// Call the `analyze_task` MCP tool.
    McpAnalyze,
    /// Call the `synthesize_document` or `draft_workflow` MCP tool.
    McpSynthesize,
    /// Task is rejected — budget exceeded or deadline passed.
    Rejected { reason: String },
}

impl RouteDecision {
    pub fn as_u8(&self) -> u8 {
        match self {
            Self::FastPath        => 0,
            Self::McpAnalyze      => 1,
            Self::McpSynthesize   => 2,
            Self::Rejected { .. } => 3,
        }
    }

    pub fn is_llm(&self) -> bool {
        matches!(self, Self::McpAnalyze | Self::McpSynthesize)
    }
}

// ─── Policy Router ────────────────────────────────────────────────────────────

/// Stateless routing logic. Operates on shared `PolicyState`.
pub struct PolicyRouter;

impl PolicyRouter {
    /// Compute binary gate score g = σ(wᵀx + b).
    #[inline]
    pub fn gate_score(x: &[f32], policy: &PolicyState) -> f32 {
        let dot: f32 = policy.weights.iter().zip(x.iter()).map(|(w, xi)| w * xi).sum();
        sigmoid(dot + policy.bias)
    }

    /// Compute softmax logits for K route classes.
    pub fn softmax_logits(x: &[f32], policy: &PolicyState) -> Vec<f32> {
        let n = x.len();
        let k = ROUTE_CLASSES;
        let mut logits = vec![0.0f32; k];

        for c in 0..k {
            let row_start = c * n;
            let dot: f32 = policy.multi_weights[row_start..row_start + n]
                .iter()
                .zip(x.iter())
                .map(|(w, xi)| w * xi)
                .sum();
            logits[c] = dot + policy.multi_bias[c];
        }

        softmax_inplace(&mut logits);
        logits
    }

    /// Primary routing function. Uses binary gate for fast binary decision,
    /// falls back to softmax argmax when score is ambiguous (0.4 ≤ g ≤ 0.85).
    pub fn route(x: &[f32], policy: &PolicyState) -> Result<RouteDecision, KernelError> {
        let g = Self::gate_score(x, policy);
        let theta = policy.gate_threshold;

        // Clear fast path: well below threshold
        if g < theta * 0.55 {
            return Ok(RouteDecision::FastPath);
        }

        // Clear LLM path: well above threshold — use softmax for fine-grained choice
        if g >= theta {
            let probs = Self::softmax_logits(x, policy);
            let best = probs
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
                .unwrap_or(0);

            return Ok(match best {
                1 => RouteDecision::McpAnalyze,
                2 => RouteDecision::McpSynthesize,
                3 => RouteDecision::Rejected { reason: "softmax class 3 selected".into() },
                _ => RouteDecision::McpAnalyze,
            });
        }

        // Ambiguous zone: default to fast path (conservative)
        Ok(RouteDecision::FastPath)
    }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/// Sigmoid function σ(z) = 1 / (1 + e^{-z})
#[inline(always)]
pub fn sigmoid(z: f32) -> f32 {
    1.0 / (1.0 + (-z).exp())
}

/// In-place numerically stable softmax.
pub fn softmax_inplace(logits: &mut [f32]) {
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let mut sum = 0.0f32;
    for l in logits.iter_mut() {
        *l = (*l - max).exp();
        sum += *l;
    }
    for l in logits.iter_mut() {
        *l /= sum;
    }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

fn now_unix_ns() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_policy(dim: usize) -> PolicyState {
        PolicyState::new(dim, PolicyState::DEFAULT_THETA, PolicyState::DEFAULT_ALPHA)
    }

    #[test]
    fn test_sigmoid_bounds() {
        assert!(sigmoid(0.0) > 0.49 && sigmoid(0.0) < 0.51);
        assert!(sigmoid(10.0) > 0.99);
        assert!(sigmoid(-10.0) < 0.01);
    }

    #[test]
    fn test_softmax_sums_to_one() {
        let mut v = vec![1.0f32, 2.0, 3.0, 4.0];
        softmax_inplace(&mut v);
        let sum: f32 = v.iter().sum();
        assert!((sum - 1.0).abs() < 1e-6, "softmax sum = {sum}");
    }

    #[test]
    fn test_zero_weights_routes_fast_path() {
        let policy = make_policy(64);
        let x = vec![0.0f32; 64];
        // With zero weights, gate score = σ(0) = 0.5, which is < θ=0.72 * 0.55 = 0.396... wait
        // σ(0) = 0.5, and 0.5 < 0.72 is true but 0.5 >= 0.72*0.55=0.396 — falls into ambiguous
        // ambiguous zone → FastPath (conservative default)
        let route = PolicyRouter::route(&x, &policy).unwrap();
        assert_eq!(route, RouteDecision::FastPath);
    }

    #[test]
    fn test_ema_update_shifts_weights() {
        let mut policy = make_policy(8);
        let x = vec![1.0f32; 8];
        let initial_w0 = policy.weights[0];
        policy.ema_update(&x, 1.0);
        assert_ne!(policy.weights[0], initial_w0);
        assert_eq!(policy.version, 1);
    }
}
