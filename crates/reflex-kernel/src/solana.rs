//! Solana/Anchor client: submits execution proofs to the workflow-escrow program.
//!
//! Uses `anchor-client` (async feature) to build and send Anchor instructions.
//! Account metas are constructed manually to avoid importing the program crate
//! (which would be a circular dep in the workspace).
//!
//! PDA seeds must stay in sync with programs/workflow-escrow/src/lib.rs.

use std::sync::Arc;

use anchor_client::{Client, Cluster, DynSigner};
use anchor_lang::{prelude::Pubkey, solana_program::instruction::AccountMeta, AnchorSerialize};
use serde::{Deserialize, Serialize};
use solana_commitment_config::CommitmentConfig;
use solana_keypair::{read_keypair_file, Keypair};
use solana_instruction::Instruction;
use solana_rpc_client::nonblocking::rpc_client::RpcClient;
use solana_signer::Signer; // for keypair.pubkey()
use uuid::Uuid;

use crate::{attestation::StateAttestation, error::KernelError};

// ─── PDA seeds ────────────────────────────────────────────────────────────────

const SEED_ESCROW: &[u8] = b"escrow";
const SEED_ATTEST: &[u8] = b"attest";
const SEED_AGENT:  &[u8] = b"agent";

/// System program ID (constant, never changes)
fn system_program_id() -> Pubkey {
    "11111111111111111111111111111111".parse().unwrap()
}

// ─── Instruction discriminators ───────────────────────────────────────────────
//
// sha256("global:<ix_name>")[..8]  — stable Anchor convention.
// Computed with: python3 -c "import hashlib; h=hashlib.sha256(b'global:<name>').digest(); print(list(h[:8]))"

mod disc {
    pub const REGISTER_AGENT: [u8; 8]         = [135, 157, 66, 195,   2, 113, 175,  30];
    pub const SUBMIT_EXECUTION_PROOF: [u8; 8] = [ 30, 108, 164, 126, 188, 160,  33, 150];
    pub const INITIALIZE_WORKFLOW: [u8; 8]    = [  9, 226, 202, 241, 194,  97, 181, 111];
}

// ─── Result types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofSubmissionResult {
    pub signature:       String,
    pub attestation_pda: String,
    pub slot:            u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterAgentResult {
    pub signature:        String,
    pub agent_record_pda: String,
}

// ─── PDA derivation ───────────────────────────────────────────────────────────

pub fn escrow_pda(program_id: &Pubkey, depositor: &Pubkey, workflow_id: &[u8; 16]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[SEED_ESCROW, depositor.as_ref(), workflow_id.as_ref()],
        program_id,
    )
}

pub fn attestation_pda(program_id: &Pubkey, composite_hash: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[SEED_ATTEST, composite_hash.as_ref()],
        program_id,
    )
}

pub fn agent_record_pda(program_id: &Pubkey, agent: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[SEED_AGENT, agent.as_ref()],
        program_id,
    )
}

// ─── Instruction data builders ────────────────────────────────────────────────

fn build_ix_data<T: AnchorSerialize>(discriminator: [u8; 8], args: &T) -> Vec<u8> {
    let mut data = discriminator.to_vec();
    args.serialize(&mut data).expect("ix serialization failed");
    data
}

#[derive(AnchorSerialize)]
struct RegisterAgentArgs;

#[derive(AnchorSerialize)]
struct SubmitExecutionProofArgs {
    task_id:        [u8; 16],
    input_hash:     [u8; 32],
    state_hash:     [u8; 32],
    output_hash:    [u8; 32],
    composite_hash: [u8; 32],
    execution_ns:   u64,
    route_taken:    u8,
}

#[derive(AnchorSerialize)]
struct InitializeWorkflowArgs {
    workflow_id:      [u8; 16],
    bounty_lamports:  u64,
    deadline_unix_s:  i64,
    authorized_agent: Option<Pubkey>,
    task_spec_hash:   [u8; 32],
    max_proofs:       u8,
}

// ─── AnchorClient ─────────────────────────────────────────────────────────────

pub struct AnchorClient {
    pub rpc_url:      String,
    pub program_id:   String,
    pub keypair_path: String,
    pub commitment:   String,
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

    fn load_keypair(&self) -> Result<Keypair, KernelError> {
        let path = shellexpand::tilde(&self.keypair_path).into_owned();
        read_keypair_file(&path)
            .map_err(|e| KernelError::SolanaError(format!("keypair read failed: {e}")))
    }

    fn commitment_config(&self) -> CommitmentConfig {
        match self.commitment.as_str() {
            "finalized" => CommitmentConfig::finalized(),
            "processed" => CommitmentConfig::processed(),
            _           => CommitmentConfig::confirmed(),
        }
    }

    fn program_pubkey(&self) -> Result<Pubkey, KernelError> {
        self.program_id
            .parse::<Pubkey>()
            .map_err(|e| KernelError::SolanaError(format!("invalid program_id: {e}")))
    }

    fn build_program(
        &self,
        keypair: Keypair,
    ) -> Result<anchor_client::Program<Arc<DynSigner>>, KernelError> {
        let program_id = self.program_pubkey()?;
        let commitment = self.commitment_config();
        let ws_url     = self.rpc_url
            .replace("https://", "wss://")
            .replace("http://",  "ws://");
        let cluster    = Cluster::Custom(self.rpc_url.clone(), ws_url);
        let payer: Arc<DynSigner> = Arc::new(DynSigner(Arc::new(keypair)));
        Client::new_with_options(cluster, payer, commitment)
            .program(program_id)
            .map_err(|e| KernelError::SolanaError(format!("program client error: {e}")))
    }

    fn rpc_client(&self) -> RpcClient {
        RpcClient::new_with_commitment(self.rpc_url.clone(), self.commitment_config())
    }

    // ── register_agent ────────────────────────────────────────────────────────

    pub async fn register_agent(&self) -> Result<RegisterAgentResult, KernelError> {
        let keypair    = self.load_keypair()?;
        let agent      = keypair.pubkey();
        let program_id = self.program_pubkey()?;
        let program    = self.build_program(keypair)?;

        let (agent_record, _) = agent_record_pda(&program_id, &agent);

        let ix = Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(agent,          true),
                AccountMeta::new(agent_record,   false),
                AccountMeta::new_readonly(system_program_id(), false),
            ],
            data: build_ix_data(disc::REGISTER_AGENT, &RegisterAgentArgs),
        };

        let sig = program
            .request()
            .instruction(ix)
            .send()
            .await
            .map_err(|e| {
                let s = e.to_string();
                if s.contains("already in use") {
                    return KernelError::SolanaError("__ALREADY_EXISTS__".into());
                }
                KernelError::SolanaError(format!("register_agent failed: {s}"))
            });

        match sig {
            Err(KernelError::SolanaError(ref s)) if s == "__ALREADY_EXISTS__" => {
                Ok(RegisterAgentResult {
                    signature:        "already_registered".into(),
                    agent_record_pda: agent_record.to_string(),
                })
            }
            Err(e)   => Err(e),
            Ok(sig)  => Ok(RegisterAgentResult {
                signature:        sig.to_string(),
                agent_record_pda: agent_record.to_string(),
            }),
        }
    }

    // ── submit_execution_proof ────────────────────────────────────────────────

    pub async fn submit_execution_proof(
        &self,
        attest:      &StateAttestation,
        depositor:   &Pubkey,
        workflow_id: Uuid,
    ) -> Result<ProofSubmissionResult, KernelError> {
        let keypair    = self.load_keypair()?;
        let agent      = keypair.pubkey();
        let program_id = self.program_pubkey()?;
        let program    = self.build_program(keypair)?;

        let wf_id_bytes: [u8; 16] = *workflow_id.as_bytes();
        let (escrow, _)       = escrow_pda(&program_id, depositor, &wf_id_bytes);
        let (attestation, _)  = attestation_pda(&program_id, &attest.composite_hash);
        let (agent_record, _) = agent_record_pda(&program_id, &agent);
        let task_id: [u8; 16] = *attest.task_id.as_bytes();

        let ix = Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(agent,          true),
                AccountMeta::new(escrow,         false),
                AccountMeta::new(attestation,    false),
                AccountMeta::new(agent_record,   false),
                AccountMeta::new_readonly(system_program_id(), false),
            ],
            data: build_ix_data(disc::SUBMIT_EXECUTION_PROOF, &SubmitExecutionProofArgs {
                task_id,
                input_hash:     attest.input_hash,
                state_hash:     attest.state_hash,
                output_hash:    attest.output_hash,
                composite_hash: attest.composite_hash,
                execution_ns:   attest.execution_ns,
                route_taken:    attest.route_taken.as_u8(),
            }),
        };

        let sig = program
            .request()
            .instruction(ix)
            .send()
            .await
            .map_err(|e| KernelError::SolanaError(format!("submit_proof failed: {e}")))?;

        let slot = self.rpc_client()
            .get_slot()
            .await
            .unwrap_or(0);

        Ok(ProofSubmissionResult {
            signature:       sig.to_string(),
            attestation_pda: attestation.to_string(),
            slot,
        })
    }

    // ── initialize_workflow ───────────────────────────────────────────────────

    pub async fn initialize_workflow(
        &self,
        workflow_id:      Uuid,
        bounty_lamports:  u64,
        deadline_unix_s:  i64,
        task_spec_hash:   [u8; 32],
        max_proofs:       u8,
        authorized_agent: Option<Pubkey>,
    ) -> Result<String, KernelError> {
        let keypair    = self.load_keypair()?;
        let depositor  = keypair.pubkey();
        let program_id = self.program_pubkey()?;
        let program    = self.build_program(keypair)?;

        let wf_id_bytes: [u8; 16] = *workflow_id.as_bytes();
        let (escrow, _) = escrow_pda(&program_id, &depositor, &wf_id_bytes);

        let ix = Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(depositor, true),
                AccountMeta::new(escrow,    false),
                AccountMeta::new_readonly(system_program_id(), false),
            ],
            data: build_ix_data(disc::INITIALIZE_WORKFLOW, &InitializeWorkflowArgs {
                workflow_id: wf_id_bytes,
                bounty_lamports,
                deadline_unix_s,
                authorized_agent,
                task_spec_hash,
                max_proofs,
            }),
        };

        let sig = program
            .request()
            .instruction(ix)
            .send()
            .await
            .map_err(|e| KernelError::SolanaError(format!("initialize_workflow failed: {e}")))?;

        Ok(sig.to_string())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const PROG:   &str = "6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5";
    const WALLET: &str = "9Bz7p4RWdX7eaR4hFUeCc7aSZjDHsie8q1u8imwavkBN";

    fn prog()   -> Pubkey { PROG.parse().unwrap()   }
    fn wallet() -> Pubkey { WALLET.parse().unwrap() }

    #[test]
    fn test_pda_deterministic() {
        let wf = [1u8; 16];
        let (a, b1) = escrow_pda(&prog(), &wallet(), &wf);
        let (c, b2) = escrow_pda(&prog(), &wallet(), &wf);
        assert_eq!(a, c);
        assert_eq!(b1, b2);
    }

    #[test]
    fn test_different_workflows_different_pdas() {
        let (a, _) = escrow_pda(&prog(), &wallet(), &[0u8; 16]);
        let (b, _) = escrow_pda(&prog(), &wallet(), &[1u8; 16]);
        assert_ne!(a, b);
    }

    #[test]
    fn test_attestation_pda_unique_per_composite_hash() {
        let (a, _) = attestation_pda(&prog(), &[0u8; 32]);
        let (b, _) = attestation_pda(&prog(), &[1u8; 32]);
        assert_ne!(a, b);
    }

    #[test]
    fn test_register_agent_discriminator() {
        let data = build_ix_data(disc::REGISTER_AGENT, &RegisterAgentArgs);
        assert_eq!(&data[..8], &disc::REGISTER_AGENT);
        assert_eq!(data.len(), 8, "RegisterAgent has no args so data is exactly 8 bytes");
    }

    #[test]
    fn test_submit_proof_discriminator() {
        let args = SubmitExecutionProofArgs {
            task_id:        [1u8; 16],
            input_hash:     [2u8; 32],
            state_hash:     [3u8; 32],
            output_hash:    [4u8; 32],
            composite_hash: [5u8; 32],
            execution_ns:   12345,
            route_taken:    0,
        };
        let data = build_ix_data(disc::SUBMIT_EXECUTION_PROOF, &args);
        assert_eq!(&data[..8], &disc::SUBMIT_EXECUTION_PROOF);
        // 8 disc + 16 task_id + 32*4 hashes + 8 ns + 1 route = 8+16+128+8+1 = 161
        assert_eq!(data.len(), 161);
    }
}
