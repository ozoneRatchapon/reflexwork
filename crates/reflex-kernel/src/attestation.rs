//! BLAKE3 state attestation module.
//!
//! Produces `StateAttestation` structs containing three hash fields and a
//! composite proof hash suitable for submission to the Anchor program.
//!
//! Hash construction:
//!   input_hash  = BLAKE3(canonical(task_spec))
//!   state_hash  = BLAKE3(canonical(personality_snapshot))
//!   output_hash = BLAKE3(canonical(route_decision_bytes))
//!   composite   = BLAKE3(input_hash || state_hash || output_hash)  // 96 bytes total

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::KernelError,
    policy::{PersonalitySnapshot, RouteDecision},
    types::TaskSpec,
};

// ─── StateAttestation ────────────────────────────────────────────────────────

/// Cryptographic attestation produced after every task execution.
/// The `composite_hash` field is what gets submitted to the Anchor program.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateAttestation {
    /// Links to the PersonalitySnapshot used during this execution.
    pub snapshot_id: Uuid,

    /// The task this attestation covers.
    pub task_id: Uuid,

    /// BLAKE3(canonical bincode of TaskSpec)
    pub input_hash: [u8; 32],

    /// BLAKE3(canonical bincode of PersonalitySnapshot)
    pub state_hash: [u8; 32],

    /// BLAKE3(canonical bincode of route_decision_bytes)
    pub output_hash: [u8; 32],

    /// BLAKE3(input_hash || state_hash || output_hash)  — primary onchain proof
    pub composite_hash: [u8; 32],

    /// Route taken by the kernel.
    pub route_taken: RouteDecision,

    /// Wall-clock execution time in nanoseconds.
    pub execution_ns: u64,

    /// Unix nanoseconds when this attestation was created.
    pub timestamp_unix_ns: u64,
}

impl StateAttestation {
    /// Hex-encode the composite hash for display / JSON serialization.
    pub fn composite_hex(&self) -> String {
        hex::encode(self.composite_hash)
    }

    /// Hex-encode all three sub-hashes as a debug string.
    pub fn debug_hashes(&self) -> String {
        format!(
            "input={} state={} output={} composite={}",
            hex::encode(self.input_hash),
            hex::encode(self.state_hash),
            hex::encode(self.output_hash),
            hex::encode(self.composite_hash),
        )
    }
}

// ─── StateAttestor ────────────────────────────────────────────────────────────

/// Stateless service that builds `StateAttestation` values.
#[derive(Debug, Default, Clone)]
pub struct StateAttestor {
    pub domain_sep: String,
}

impl StateAttestor {
    pub fn new(domain_sep: impl Into<String>) -> Self {
        Self { domain_sep: domain_sep.into() }
    }

    /// Build a complete `StateAttestation` for the given task execution.
    pub fn attest(
        &self,
        snapshot: &PersonalitySnapshot,
        task: &TaskSpec,
        route: &RouteDecision,
        execution_ns: u64,
    ) -> Result<StateAttestation, KernelError> {
        let input_hash  = self.hash_task(task)?;
        let state_hash  = self.hash_snapshot(snapshot)?;
        let output_hash = self.hash_route(route)?;
        let composite   = Self::composite(&input_hash, &state_hash, &output_hash);

        Ok(StateAttestation {
            snapshot_id:    snapshot.snapshot_id,
            task_id:        task.id,
            input_hash,
            state_hash,
            output_hash,
            composite_hash: composite,
            route_taken:    route.clone(),
            execution_ns,
            timestamp_unix_ns: now_unix_ns(),
        })
    }

    // ── Internal hash helpers ─────────────────────────────────────────────────

    fn hash_task(&self, task: &TaskSpec) -> Result<[u8; 32], KernelError> {
        let bytes = canonical_bytes(task)?;
        Ok(blake3_hash_with_domain(&self.domain_sep, &bytes))
    }

    fn hash_snapshot(&self, snapshot: &PersonalitySnapshot) -> Result<[u8; 32], KernelError> {
        let bytes = canonical_bytes(snapshot)?;
        Ok(blake3_hash_with_domain(&self.domain_sep, &bytes))
    }

    fn hash_route(&self, route: &RouteDecision) -> Result<[u8; 32], KernelError> {
        // Route is encoded as a single byte (its discriminant) for minimal, stable output.
        let byte = [route.as_u8()];
        Ok(blake3_hash_with_domain(&self.domain_sep, &byte))
    }

    /// BLAKE3(input_hash || state_hash || output_hash) — 96-byte pre-image.
    fn composite(input: &[u8; 32], state: &[u8; 32], output: &[u8; 32]) -> [u8; 32] {
        let mut preimage = [0u8; 96];
        preimage[..32].copy_from_slice(input);
        preimage[32..64].copy_from_slice(state);
        preimage[64..96].copy_from_slice(output);
        *blake3::hash(&preimage).as_bytes()
    }
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/// Canonical, deterministic bincode serialization (little-endian, fixed-int, no trailing bytes).
fn canonical_bytes<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, KernelError> {
    bincode::serialize(value).map_err(|e| KernelError::Serialization(e.to_string()))
}

/// BLAKE3 with domain separation prefix to prevent cross-context collisions.
fn blake3_hash_with_domain(domain: &str, data: &[u8]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new_derive_key(domain);
    hasher.update(data);
    *hasher.finalize().as_bytes()
}

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
    use crate::{
        policy::{PersonalitySnapshot, PolicyState, RouteDecision},
        types::{TaskCategory, TaskSpec},
    };
    use uuid::Uuid;

    fn sample_task() -> TaskSpec {
        TaskSpec {
            id: Uuid::new_v4(),
            category: TaskCategory::DataQuery,
            raw_input: "Fetch sales report for Q3".to_string(),
            token_budget: 1024,
            deadline_unix_ns: 0,
            priority: 128,
            context_tags: vec!["sales".into(), "q3".into()],
            requester_pubkey: None,
            workflow_id: None,
        }
    }

    fn sample_snapshot() -> PersonalitySnapshot {
        let policy = PolicyState::new(64, 0.72, 0.97);
        PersonalitySnapshot::from_policy(&policy, "test-devnet")
    }

    #[test]
    fn test_attestation_determinism() {
        // Same inputs must produce same output_hash and state_hash
        let task     = sample_task();
        let snapshot = sample_snapshot();
        let attestor = StateAttestor::new("reflexwork-v1");

        let a1 = attestor.attest(&snapshot, &task, &RouteDecision::FastPath, 12_000).unwrap();
        let a2 = attestor.attest(&snapshot, &task, &RouteDecision::FastPath, 99_999).unwrap();

        // input and state hashes are deterministic (not time-dependent)
        assert_eq!(a1.input_hash, a2.input_hash);
        assert_eq!(a1.state_hash, a2.state_hash);
        assert_eq!(a1.output_hash, a2.output_hash);
        assert_eq!(a1.composite_hash, a2.composite_hash);
    }

    #[test]
    fn test_composite_hash_uses_all_three() {
        let task     = sample_task();
        let snapshot = sample_snapshot();
        let attestor = StateAttestor::new("reflexwork-v1");

        let a_fast = attestor.attest(&snapshot, &task, &RouteDecision::FastPath, 0).unwrap();
        let a_mcp  = attestor.attest(&snapshot, &task, &RouteDecision::McpAnalyze, 0).unwrap();

        // Different route → different output_hash → different composite
        assert_ne!(a_fast.output_hash,    a_mcp.output_hash);
        assert_ne!(a_fast.composite_hash, a_mcp.composite_hash);
        // But input and state hashes are the same
        assert_eq!(a_fast.input_hash,  a_mcp.input_hash);
        assert_eq!(a_fast.state_hash,  a_mcp.state_hash);
    }

    #[test]
    fn test_composite_verification_matches_anchor_logic() {
        let task     = sample_task();
        let snapshot = sample_snapshot();
        let attestor = StateAttestor::new("reflexwork-v1");
        let attest   = attestor.attest(&snapshot, &task, &RouteDecision::FastPath, 0).unwrap();

        // Replicate the Anchor program's onchain verification:
        let mut preimage = [0u8; 96];
        preimage[..32].copy_from_slice(&attest.input_hash);
        preimage[32..64].copy_from_slice(&attest.state_hash);
        preimage[64..96].copy_from_slice(&attest.output_hash);
        let expected = *blake3::hash(&preimage).as_bytes();

        // NOTE: Anchor uses raw blake3 (no domain sep) for the composite step,
        // so we compare against the domain-sep composite. For production, the
        // Anchor program and kernel must agree on whether the composite step
        // uses domain separation. Here we verify internal consistency only.
        assert_eq!(attest.composite_hash, expected,
            "composite hash must match Anchor's blake3(input||state||output) logic");
    }
}
