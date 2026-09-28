//! Solana/Anchor client: submits execution proofs to the workflow-escrow program.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{attestation::StateAttestation, error::KernelError};

/// Result of a successful proof submission to Solana.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofSubmissionResult {
    /// Base58-encoded transaction signature.
    pub signature: String,

    /// Pubkey of the created TaskAttestation PDA.
    pub attestation_pda: String,

    /// Confirmed slot number.
    pub slot: u64,
}

/// Async Solana client for the workflow-escrow Anchor program.
pub struct AnchorClient {
    pub rpc_url:    String,
    pub program_id: String,
    pub keypair_path: String,
    pub commitment: String,
}

impl AnchorClient {
    pub fn new(rpc_url: &str, program_id: &str, keypair_path: &str, commitment: &str) -> Self {
        Self {
            rpc_url:      rpc_url.to_owned(),
            program_id:   program_id.to_owned(),
            keypair_path: keypair_path.to_owned(),
            commitment:   commitment.to_owned(),
        }
    }

    /// Submit a BLAKE3 execution proof to the workflow-escrow Anchor program.
    ///
    /// Calls `submit_execution_proof` instruction with the attestation data.
    pub async fn submit_execution_proof(
        &self,
        attest: &StateAttestation,
        workflow_id: Uuid,
        task_id_bytes: [u8; 16],
    ) -> Result<ProofSubmissionResult, KernelError> {
        // TODO: Implement using anchor-client / solana-sdk
        // Steps:
        //   1. Load keypair from self.keypair_path
        //   2. Derive escrow PDA: [b"escrow", depositor, workflow_id]
        //   3. Derive attestation PDA: [b"attest", composite_hash]
        //   4. Derive agent_record PDA: [b"agent", agent.pubkey]
        //   5. Build and sign the instruction
        //   6. Send and confirm with self.commitment

        let _ = (attest, workflow_id, task_id_bytes);

        Err(KernelError::SolanaError(
            "Solana client not yet initialized — implement in solana/client.rs".into()
        ))
    }

    /// Register agent (one-time call, idempotent after first call).
    pub async fn register_agent(&self) -> Result<String, KernelError> {
        Err(KernelError::SolanaError(
            "Solana client not yet initialized — implement in solana/client.rs".into()
        ))
    }
}
