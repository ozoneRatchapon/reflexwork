//! Feature encoder: projects a `TaskSpec` into a fixed-dimension f32 vector.
//!
//! Layout (N = 64):
//! ```text
//! [0..8]   one-hot task category       (8 dims)
//! [8..16]  complexity score (scalar)   (8 dims, value in dim 8, rest zero)
//! [16..24] token budget fraction       (8 dims, value in dim 16)
//! [24..32] deadline fraction           (8 dims, value in dim 24)
//! [32..48] context tag TF features     (16 dims)
//! [48..64] reserved / zero-padded      (16 dims)
//! ```

use std::collections::HashMap;

use crate::{error::KernelError, types::{TaskCategory, TaskSpec}};

pub const FEATURE_DIM: usize = 64;
pub const CATEGORY_DIM: usize = 8;    // [0..8]
pub const SCALAR_SLOT: usize = 8;     // one scalar slot each = 8 dims wide
pub const CONTEXT_START: usize = 32;
pub const CONTEXT_DIM: usize = 16;

/// Encodes a `TaskSpec` into x ∈ ℝᴺ.
pub struct FeatureEncoder {
    pub feature_dim: usize,

    /// Maps context tag keywords to context feature indices [0..CONTEXT_DIM).
    vocabulary: HashMap<String, usize>,

    /// Total token budget at initialization — used for normalization.
    initial_token_budget: u32,
}

impl FeatureEncoder {
    pub fn new(feature_dim: usize) -> Self {
        Self {
            feature_dim,
            vocabulary: HashMap::new(),
            initial_token_budget: 4096,
        }
    }

    /// Add context tag → feature index mapping to the vocabulary.
    pub fn register_tag(&mut self, tag: impl Into<String>, index: usize) {
        assert!(index < CONTEXT_DIM, "context index out of range");
        self.vocabulary.insert(tag.into(), index);
    }

    /// Set the normalization denominator for token_budget feature.
    pub fn set_initial_budget(&mut self, budget: u32) {
        self.initial_token_budget = budget;
    }

    /// Encode a `TaskSpec` into a feature vector x ∈ ℝᴺ.
    ///
    /// # Errors
    /// Returns `KernelError::EncodingError` if `feature_dim` is too small.
    pub fn encode(&self, task: &TaskSpec) -> Result<Vec<f32>, KernelError> {
        if self.feature_dim < FEATURE_DIM {
            return Err(KernelError::EncodingError(format!(
                "feature_dim {} < required {}", self.feature_dim, FEATURE_DIM
            )));
        }

        let mut x = vec![0.0f32; self.feature_dim];

        // ── [0..8] One-hot task category ──────────────────────────────────────
        let cat_idx = task.category.one_hot_index().min(CATEGORY_DIM - 1);
        x[cat_idx] = 1.0;

        // ── [8] Complexity score ──────────────────────────────────────────────
        x[SCALAR_SLOT] = task.raw_complexity_estimate().clamp(0.0, 1.0);

        // ── [16] Token budget fraction ────────────────────────────────────────
        let budget_frac = (task.token_budget as f32) / (self.initial_token_budget as f32);
        x[SCALAR_SLOT * 2] = budget_frac.clamp(0.0, 1.0);

        // ── [24] Deadline fraction ────────────────────────────────────────────
        let deadline_frac = if task.deadline_unix_ns == 0 {
            1.0 // No deadline = max urgency cushion
        } else {
            let remaining_ms = task.deadline_remaining_ms();
            let hard_ms = 30_000u64; // 30 second reference window
            (remaining_ms as f32 / hard_ms as f32).clamp(0.0, 1.0)
        };
        x[SCALAR_SLOT * 3] = deadline_frac;

        // ── [32..48] Context tag TF features ─────────────────────────────────
        let n_tags = task.context_tags.len() as f32;
        if n_tags > 0.0 {
            for tag in &task.context_tags {
                let key = tag.to_lowercase();
                if let Some(&idx) = self.vocabulary.get(&key) {
                    let feat_idx = CONTEXT_START + idx;
                    x[feat_idx] = (x[feat_idx] + 1.0 / n_tags).min(1.0);
                }
            }
        }

        // Priority boost applied to complexity dimension
        let priority_norm = task.priority as f32 / 255.0;
        x[SCALAR_SLOT] = (x[SCALAR_SLOT] * 0.7 + priority_norm * 0.3).clamp(0.0, 1.0);

        Ok(x)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{TaskCategory, TaskSpec};
    use uuid::Uuid;

    fn make_task(cat: TaskCategory, input: &str, budget: u32, priority: u8) -> TaskSpec {
        TaskSpec {
            id: Uuid::new_v4(),
            category: cat,
            raw_input: input.to_string(),
            token_budget: budget,
            deadline_unix_ns: 0,
            priority,
            context_tags: vec!["compliance".into(), "pdpa".into()],
            requester_pubkey: None,
            workflow_id: None,
        }
    }

    #[test]
    fn test_encode_length() {
        let mut enc = FeatureEncoder::new(64);
        enc.register_tag("compliance", 0);
        enc.register_tag("pdpa", 1);
        let task = make_task(TaskCategory::ComplianceCheck, "Review report", 1024, 200);
        let x = enc.encode(&task).unwrap();
        assert_eq!(x.len(), 64);
    }

    #[test]
    fn test_category_one_hot() {
        let enc = FeatureEncoder::new(64);
        let task = make_task(TaskCategory::CodeGen, "Write code", 2048, 128);
        let x = enc.encode(&task).unwrap();
        // CodeGen one_hot_index = 1
        assert_eq!(x[1], 1.0);
        // Other category slots should be 0
        assert_eq!(x[0], 0.0);
        assert_eq!(x[2], 0.0);
    }

    #[test]
    fn test_budget_fraction() {
        let mut enc = FeatureEncoder::new(64);
        enc.set_initial_budget(4096);
        let task = make_task(TaskCategory::DataQuery, "query", 2048, 0);
        let x = enc.encode(&task).unwrap();
        // budget_frac = 2048/4096 = 0.5
        let expected = 0.5f32;
        assert!((x[SCALAR_SLOT * 2] - expected).abs() < 0.01);
    }

    #[test]
    fn test_context_tags_encoded() {
        let mut enc = FeatureEncoder::new(64);
        enc.register_tag("compliance", 0);
        let task = make_task(TaskCategory::ComplianceCheck, "Check compliance", 1024, 128);
        let x = enc.encode(&task).unwrap();
        assert!(x[CONTEXT_START] > 0.0, "compliance tag should be encoded");
    }
}
