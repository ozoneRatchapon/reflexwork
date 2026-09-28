//! Budget controller: enforces token budget and deadline constraints.

use crate::{error::KernelError, types::TaskSpec};

/// Tracks and enforces per-agent token budget and deadline constraints.
#[derive(Debug, Clone)]
pub struct BudgetController {
    pub default_token_budget: u32,
    pub hard_deadline_ms: u64,
    pub tokens_consumed: u64,
    pub llm_call_count: u64,
    pub cost_per_llm_call: u32,
}

impl BudgetController {
    pub fn new(default_token_budget: u32, hard_deadline_ms: u64) -> Self {
        Self {
            default_token_budget,
            hard_deadline_ms,
            tokens_consumed: 0,
            llm_call_count: 0,
            cost_per_llm_call: 500,
        }
    }

    /// Check whether a task can proceed given current budget and deadline constraints.
    pub fn check(&self, task: &TaskSpec) -> Result<(), KernelError> {
        if task.is_expired() {
            return Err(KernelError::DeadlineExceeded {
                task_id: task.id,
                deadline_unix_ns: task.deadline_unix_ns,
            });
        }

        let remaining_ms = task.deadline_remaining_ms();
        if remaining_ms < self.hard_deadline_ms {
            return Err(KernelError::DeadlineTooClose {
                remaining_ms,
                required_ms: self.hard_deadline_ms,
            });
        }

        if task.token_budget == 0 {
            return Err(KernelError::BudgetExhausted {
                task_id: task.id,
                available: 0,
                required: 1,
            });
        }

        Ok(())
    }

    /// Deduct tokens after an LLM invocation.
    pub fn deduct_llm_call(&mut self, tokens_used: u32) {
        self.tokens_consumed += tokens_used as u64;
        self.llm_call_count += 1;
    }

    /// Reset the budget ledger (called per-workflow or per-session).
    pub fn reset(&mut self) {
        self.tokens_consumed = 0;
        self.llm_call_count = 0;
    }
}
