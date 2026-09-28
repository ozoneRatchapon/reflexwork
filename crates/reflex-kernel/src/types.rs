//! Core data types shared across all kernel modules.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Inbound task payload from any trigger source (Kiro Hook, CLI, REST).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    /// UUIDv4 unique identifier for this task.
    pub id: Uuid,

    /// High-level task category used for one-hot encoding.
    pub category: TaskCategory,

    /// Raw natural language or structured task description.
    pub raw_input: String,

    /// Maximum tokens allowed for any System 2 (MCP/LLM) invocation.
    pub token_budget: u32,

    /// Hard deadline as Unix nanoseconds. 0 = no deadline.
    pub deadline_unix_ns: u64,

    /// Priority level. 0 = lowest, 255 = critical.
    pub priority: u8,

    /// Keyword tags for context-feature encoding.
    pub context_tags: Vec<String>,

    /// Solana wallet pubkey of the requester (needed for escrow).
    pub requester_pubkey: Option<String>,

    /// Links to an existing WorkflowEscrow PDA.
    pub workflow_id: Option<Uuid>,
}

impl TaskSpec {
    /// Returns true if the task's deadline has already passed.
    pub fn is_expired(&self) -> bool {
        if self.deadline_unix_ns == 0 {
            return false;
        }
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        now_ns > self.deadline_unix_ns
    }

    /// Milliseconds remaining until deadline. Returns u64::MAX if no deadline set.
    pub fn deadline_remaining_ms(&self) -> u64 {
        if self.deadline_unix_ns == 0 {
            return u64::MAX;
        }
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        if now_ns >= self.deadline_unix_ns {
            0
        } else {
            (self.deadline_unix_ns - now_ns) / 1_000_000
        }
    }

    /// Complexity score in [0.0, 1.0] — naively estimated from raw_input length.
    pub fn raw_complexity_estimate(&self) -> f32 {
        let len = self.raw_input.len() as f32;
        // Sigmoid-scale: 0 → 0, 500 chars → ~0.5, 4096+ chars → ~1.0
        1.0 / (1.0 + (-0.005 * (len - 500.0)).exp())
    }
}

/// Discriminates the primary class of a task for one-hot feature encoding.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TaskCategory {
    DocumentParse,
    CodeGen,
    DataQuery,
    WorkflowOrchestration,
    ComplianceCheck,
    OnchainSettlement,
    Research,
    Custom(String),
}

impl TaskCategory {
    /// One-hot index in [0..7]. Custom maps to index 7.
    pub fn one_hot_index(&self) -> usize {
        match self {
            Self::DocumentParse        => 0,
            Self::CodeGen              => 1,
            Self::DataQuery            => 2,
            Self::WorkflowOrchestration => 3,
            Self::ComplianceCheck      => 4,
            Self::OnchainSettlement    => 5,
            Self::Research             => 6,
            Self::Custom(_)            => 7,
        }
    }

    pub const COUNT: usize = 8;
}
