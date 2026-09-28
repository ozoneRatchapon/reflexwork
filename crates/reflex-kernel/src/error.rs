//! Unified error type for the reflex-kernel crate.

use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum KernelError {
    #[error("feature encoding failed: {0}")]
    EncodingError(String),

    #[error("canonical serialization failed: {0}")]
    Serialization(String),

    #[error("task {task_id} deadline exceeded (deadline_unix_ns={deadline_unix_ns})")]
    DeadlineExceeded { task_id: Uuid, deadline_unix_ns: u64 },

    #[error("deadline too close: {remaining_ms}ms remaining, need {required_ms}ms")]
    DeadlineTooClose { remaining_ms: u64, required_ms: u64 },

    #[error("token budget exhausted for task {task_id}: available={available}, required={required}")]
    BudgetExhausted { task_id: Uuid, available: u32, required: u32 },

    #[error("MCP call failed: {0}")]
    McpError(String),

    #[error("Solana RPC error: {0}")]
    SolanaError(String),

    #[error("proof verification failed: {0}")]
    ProofInvalid(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}
