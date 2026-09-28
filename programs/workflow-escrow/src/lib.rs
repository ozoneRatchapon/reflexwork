use anchor_lang::prelude::*;
use anchor_lang::solana_program::blake3;

declare_id!("REFLEXWORK_PLACEHOLDER_111111111111111111111111");

// ─── Constants ────────────────────────────────────────────────────────────────

pub const MIN_BOUNTY: u64 = 10_000;
pub const MIN_DEADLINE_SECS: i64 = 30;
pub const MAX_PROOF_COUNT: u8 = 10;
pub const REPUTATION_PER_SETTLEMENT: u16 = 10;
pub const SLASH_PER_INVALID_PROOF: u16 = 100;
pub const INITIAL_REPUTATION: u16 = 5_000;
pub const MAX_REPUTATION: u16 = 10_000;

// ─── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod workflow_escrow {
    use super::*;

    /// Creates a new escrow account and deposits the bounty lamports.
    pub fn initialize_workflow(
        ctx: Context<InitializeWorkflow>,
        workflow_id: [u8; 16],
        bounty_lamports: u64,
        deadline_unix_s: i64,
        authorized_agent: Option<Pubkey>,
        task_spec_hash: [u8; 32],
        max_proofs: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(bounty_lamports >= MIN_BOUNTY, ReflexError::BountyTooLow);
        require!(
            deadline_unix_s > clock.unix_timestamp + MIN_DEADLINE_SECS,
            ReflexError::DeadlineTooSoon
        );
        require!(
            max_proofs >= 1 && max_proofs <= MAX_PROOF_COUNT,
            ReflexError::InvalidMaxProofs
        );

        // Transfer bounty from depositor to escrow PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.depositor.key(),
            &ctx.accounts.escrow.key(),
            bounty_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.depositor = ctx.accounts.depositor.key();
        escrow.authorized_agent = authorized_agent;
        escrow.workflow_id = workflow_id;
        escrow.bounty_lamports = bounty_lamports;
        escrow.deadline_unix_s = deadline_unix_s;
        escrow.status = EscrowStatus::Active;
        escrow.proof_count = 0;
        escrow.max_proofs = max_proofs;
        escrow.task_spec_hash = task_spec_hash;
        escrow._padding = [0u8; 6];

        emit!(WorkflowInitialized {
            escrow: ctx.accounts.escrow.key(),
            depositor: ctx.accounts.depositor.key(),
            workflow_id,
            bounty_lamports,
            deadline_unix_s,
        });

        Ok(())
    }

    /// Accepts a BLAKE3 composite proof from a Reflex Agent.
    /// Verifies hash integrity and records the attestation onchain.
    /// Auto-settles if proof_count reaches max_proofs.
    pub fn submit_execution_proof(
        ctx: Context<SubmitExecutionProof>,
        task_id: [u8; 16],
        input_hash: [u8; 32],
        state_hash: [u8; 32],
        output_hash: [u8; 32],
        composite_hash: [u8; 32],
        execution_ns: u64,
        route_taken: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow;

        // ── Guard checks ────────────────────────────────────────────────────
        require!(
            escrow.status == EscrowStatus::Active,
            ReflexError::EscrowNotActive
        );
        require!(
            clock.unix_timestamp <= escrow.deadline_unix_s,
            ReflexError::DeadlineExpired
        );
        require!(
            escrow.proof_count < escrow.max_proofs,
            ReflexError::ProofLimitReached
        );
        if let Some(auth) = escrow.authorized_agent {
            require!(
                ctx.accounts.agent.key() == auth,
                ReflexError::UnauthorizedAgent
            );
        }

        // ── BLAKE3 composite hash verification ──────────────────────────────
        // Verify: composite_hash == BLAKE3(input_hash || state_hash || output_hash)
        let mut preimage = [0u8; 96];
        preimage[..32].copy_from_slice(&input_hash);
        preimage[32..64].copy_from_slice(&state_hash);
        preimage[64..96].copy_from_slice(&output_hash);

        let expected = blake3::hash(&preimage);
        require!(
            expected.as_bytes() == &composite_hash,
            ReflexError::InvalidProof
        );

        // ── Write attestation ────────────────────────────────────────────────
        let attest = &mut ctx.accounts.attestation;
        attest.workflow_escrow = ctx.accounts.escrow.key();
        attest.agent = ctx.accounts.agent.key();
        attest.task_id = task_id;
        attest.input_hash = input_hash;
        attest.state_hash = state_hash;
        attest.output_hash = output_hash;
        attest.composite_hash = composite_hash;
        attest.execution_ns = execution_ns;
        attest.route_taken = route_taken;
        attest.submitted_at_unix_s = clock.unix_timestamp;
        attest.settled = false;
        attest._padding = [0u8; 6];

        // ── Update state ─────────────────────────────────────────────────────
        escrow.proof_count = escrow
            .proof_count
            .checked_add(1)
            .ok_or(ReflexError::ArithmeticOverflow)?;

        let agent_record = &mut ctx.accounts.agent_record;
        agent_record.proofs_submitted = agent_record
            .proofs_submitted
            .checked_add(1)
            .ok_or(ReflexError::ArithmeticOverflow)?;
        agent_record.last_composite_hash = composite_hash;

        emit!(ProofSubmitted {
            attestation: ctx.accounts.attestation.key(),
            agent: ctx.accounts.agent.key(),
            workflow_id: escrow.workflow_id,
            composite_hash,
            execution_ns,
            route_taken,
        });

        // ── Auto-settle if all proofs received ───────────────────────────────
        if escrow.proof_count >= escrow.max_proofs {
            settle_internal(ctx, clock.unix_timestamp)?;
        }

        Ok(())
    }

    /// Explicit settlement by depositor (early release) or after proof completion.
    pub fn settle_bounty(ctx: Context<SettleBounty>) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Active,
            ReflexError::EscrowNotActive
        );

        let caller = ctx.accounts.authority.key();
        let is_depositor = caller == escrow.depositor;
        let proofs_complete = escrow.proof_count >= escrow.max_proofs;

        require!(is_depositor || proofs_complete, ReflexError::NotDepositor);

        let bounty = escrow.bounty_lamports;
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let agent_info = ctx.accounts.agent.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? = escrow_info
            .lamports()
            .checked_sub(bounty)
            .ok_or(ReflexError::ArithmeticOverflow)?;
        **agent_info.try_borrow_mut_lamports()? = agent_info
            .lamports()
            .checked_add(bounty)
            .ok_or(ReflexError::ArithmeticOverflow)?;

        let escrow_mut = &mut ctx.accounts.escrow;
        escrow_mut.status = EscrowStatus::Settled;

        let agent_record = &mut ctx.accounts.agent_record;
        agent_record.tasks_completed = agent_record
            .tasks_completed
            .checked_add(1)
            .ok_or(ReflexError::ArithmeticOverflow)?;
        agent_record.total_earned_lamports = agent_record
            .total_earned_lamports
            .checked_add(bounty)
            .ok_or(ReflexError::ArithmeticOverflow)?;
        agent_record.last_settled_unix_s = clock.unix_timestamp;
        agent_record.reputation_bps = agent_record
            .reputation_bps
            .saturating_add(REPUTATION_PER_SETTLEMENT)
            .min(MAX_REPUTATION);

        emit!(WorkflowSettled {
            escrow: ctx.accounts.escrow.key(),
            agent: ctx.accounts.agent.key(),
            bounty_lamports: bounty,
            timestamp_unix_s: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Reclaims escrow funds after deadline has passed without valid proof.
    pub fn reclaim_expired_bounty(ctx: Context<ReclaimBounty>) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Active,
            ReflexError::EscrowNotActive
        );
        require!(
            clock.unix_timestamp > escrow.deadline_unix_s,
            ReflexError::DeadlineNotExpired
        );

        let bounty = escrow.bounty_lamports;
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let depositor_info = ctx.accounts.depositor.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? = escrow_info
            .lamports()
            .checked_sub(bounty)
            .ok_or(ReflexError::ArithmeticOverflow)?;
        **depositor_info.try_borrow_mut_lamports()? = depositor_info
            .lamports()
            .checked_add(bounty)
            .ok_or(ReflexError::ArithmeticOverflow)?;

        ctx.accounts.escrow.status = EscrowStatus::Expired;

        emit!(BountyReclaimed {
            escrow: ctx.accounts.escrow.key(),
            depositor: ctx.accounts.depositor.key(),
            lamports: bounty,
        });

        Ok(())
    }

    /// One-time registration: creates an AgentStateRecord PDA for a new agent.
    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        let clock = Clock::get()?;
        let record = &mut ctx.accounts.agent_record;

        record.agent = ctx.accounts.agent.key();
        record.tasks_completed = 0;
        record.proofs_submitted = 0;
        record.total_earned_lamports = 0;
        record.total_slashed_lamports = 0;
        record.last_composite_hash = [0u8; 32];
        record.last_settled_unix_s = 0;
        record.policy_version = 0;
        record.reputation_bps = INITIAL_REPUTATION;
        record._padding = [0u8; 2];

        emit!(AgentRegistered {
            agent: ctx.accounts.agent.key(),
            timestamp_unix_s: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Internal settlement triggered by submit_execution_proof when max_proofs reached.
/// Mirrors settle_bounty logic but runs within the SubmitExecutionProof context.
fn settle_internal(ctx: Context<SubmitExecutionProof>, timestamp: i64) -> Result<()> {
    let bounty = ctx.accounts.escrow.bounty_lamports;
    let escrow_info = ctx.accounts.escrow.to_account_info();
    let agent_info = ctx.accounts.agent.to_account_info();

    **escrow_info.try_borrow_mut_lamports()? = escrow_info
        .lamports()
        .checked_sub(bounty)
        .ok_or(ReflexError::ArithmeticOverflow)?;
    **agent_info.try_borrow_mut_lamports()? = agent_info
        .lamports()
        .checked_add(bounty)
        .ok_or(ReflexError::ArithmeticOverflow)?;

    ctx.accounts.escrow.status = EscrowStatus::Settled;
    ctx.accounts.attestation.settled = true;

    let agent_record = &mut ctx.accounts.agent_record;
    agent_record.tasks_completed = agent_record
        .tasks_completed
        .checked_add(1)
        .ok_or(ReflexError::ArithmeticOverflow)?;
    agent_record.total_earned_lamports = agent_record
        .total_earned_lamports
        .checked_add(bounty)
        .ok_or(ReflexError::ArithmeticOverflow)?;
    agent_record.last_settled_unix_s = timestamp;
    agent_record.reputation_bps = agent_record
        .reputation_bps
        .saturating_add(REPUTATION_PER_SETTLEMENT)
        .min(MAX_REPUTATION);

    emit!(WorkflowSettled {
        escrow: ctx.accounts.escrow.key(),
        agent: ctx.accounts.agent.key(),
        bounty_lamports: bounty,
        timestamp_unix_s: timestamp,
    });

    Ok(())
}

// ─── Account Structs ──────────────────────────────────────────────────────────

#[account]
pub struct WorkflowEscrow {
    pub depositor: Pubkey,
    pub authorized_agent: Option<Pubkey>,
    pub workflow_id: [u8; 16],
    pub bounty_lamports: u64,
    pub deadline_unix_s: i64,
    pub status: EscrowStatus,
    pub proof_count: u8,
    pub max_proofs: u8,
    pub task_spec_hash: [u8; 32],
    pub _padding: [u8; 6],
}

impl WorkflowEscrow {
    // 8 (disc) + 32 + 33 + 16 + 8 + 8 + 1 + 1 + 1 + 32 + 6 = 146
    pub const LEN: usize = 8 + 32 + 33 + 16 + 8 + 8 + 1 + 1 + 1 + 32 + 6;
}

#[account]
pub struct AgentStateRecord {
    pub agent: Pubkey,
    pub tasks_completed: u64,
    pub proofs_submitted: u64,
    pub total_earned_lamports: u64,
    pub total_slashed_lamports: u64,
    pub last_composite_hash: [u8; 32],
    pub last_settled_unix_s: i64,
    pub policy_version: u32,
    pub reputation_bps: u16,
    pub _padding: [u8; 2],
}

impl AgentStateRecord {
    // 8 (disc) + 32 + 8 + 8 + 8 + 8 + 32 + 8 + 4 + 2 + 2 = 122
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 32 + 8 + 4 + 2 + 2;
}

#[account]
pub struct TaskAttestation {
    pub workflow_escrow: Pubkey,
    pub agent: Pubkey,
    pub task_id: [u8; 16],
    pub input_hash: [u8; 32],
    pub state_hash: [u8; 32],
    pub output_hash: [u8; 32],
    pub composite_hash: [u8; 32],
    pub execution_ns: u64,
    pub route_taken: u8,
    pub submitted_at_unix_s: i64,
    pub settled: bool,
    pub _padding: [u8; 6],
}

impl TaskAttestation {
    // 8 (disc) + 32 + 32 + 16 + 32 + 32 + 32 + 32 + 8 + 1 + 8 + 1 + 6 = 242
    pub const LEN: usize = 8 + 32 + 32 + 16 + 32 + 32 + 32 + 32 + 8 + 1 + 8 + 1 + 6;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Active,
    Settled,
    Expired,
    Disputed,
}

// ─── Instruction Contexts ─────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(workflow_id: [u8; 16])]
pub struct InitializeWorkflow<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        init,
        payer = depositor,
        space = WorkflowEscrow::LEN,
        seeds = [b"escrow", depositor.key().as_ref(), workflow_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, WorkflowEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 16], _input_hash: [u8; 32], _state_hash: [u8; 32], _output_hash: [u8; 32], composite_hash: [u8; 32])]
pub struct SubmitExecutionProof<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        constraint = escrow.status == EscrowStatus::Active @ ReflexError::EscrowNotActive
    )]
    pub escrow: Account<'info, WorkflowEscrow>,

    #[account(
        init,
        payer = agent,
        space = TaskAttestation::LEN,
        seeds = [b"attest", composite_hash.as_ref()],
        bump
    )]
    pub attestation: Account<'info, TaskAttestation>,

    #[account(
        mut,
        seeds = [b"agent", agent.key().as_ref()],
        bump,
        constraint = agent_record.agent == agent.key() @ ReflexError::AgentNotRegistered
    )]
    pub agent_record: Account<'info, AgentStateRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBounty<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = escrow.status == EscrowStatus::Active @ ReflexError::EscrowNotActive
    )]
    pub escrow: Account<'info, WorkflowEscrow>,

    /// CHECK: Validated inside instruction — must match escrow's expected agent.
    #[account(mut)]
    pub agent: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"agent", agent.key().as_ref()],
        bump
    )]
    pub agent_record: Account<'info, AgentStateRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReclaimBounty<'info> {
    #[account(
        mut,
        constraint = escrow.depositor == depositor.key() @ ReflexError::NotDepositor
    )]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = escrow.status == EscrowStatus::Active @ ReflexError::EscrowNotActive
    )]
    pub escrow: Account<'info, WorkflowEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = AgentStateRecord::LEN,
        seeds = [b"agent", agent.key().as_ref()],
        bump
    )]
    pub agent_record: Account<'info, AgentStateRecord>,

    pub system_program: Program<'info, System>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct WorkflowInitialized {
    pub escrow: Pubkey,
    pub depositor: Pubkey,
    pub workflow_id: [u8; 16],
    pub bounty_lamports: u64,
    pub deadline_unix_s: i64,
}

#[event]
pub struct ProofSubmitted {
    pub attestation: Pubkey,
    pub agent: Pubkey,
    pub workflow_id: [u8; 16],
    pub composite_hash: [u8; 32],
    pub execution_ns: u64,
    pub route_taken: u8,
}

#[event]
pub struct WorkflowSettled {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub bounty_lamports: u64,
    pub timestamp_unix_s: i64,
}

#[event]
pub struct BountyReclaimed {
    pub escrow: Pubkey,
    pub depositor: Pubkey,
    pub lamports: u64,
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub timestamp_unix_s: i64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ReflexError {
    #[msg("Bounty amount is below the minimum threshold (10,000 lamports)")]
    BountyTooLow,

    #[msg("Deadline must be at least 30 seconds in the future")]
    DeadlineTooSoon,

    #[msg("The workflow escrow is not in Active status")]
    EscrowNotActive,

    #[msg("The submission deadline has passed")]
    DeadlineExpired,

    #[msg("This agent is not authorized to execute this workflow")]
    UnauthorizedAgent,

    #[msg("The submitted BLAKE3 composite hash does not match the proof")]
    InvalidProof,

    #[msg("Maximum number of proofs for this workflow has already been reached")]
    ProofLimitReached,

    #[msg("Arithmetic overflow in lamport calculation")]
    ArithmeticOverflow,

    #[msg("Agent record does not exist; call register_agent first")]
    AgentNotRegistered,

    #[msg("max_proofs must be between 1 and 10")]
    InvalidMaxProofs,

    #[msg("Composite hash pre-image verification failed")]
    HashPreimageInvalid,

    #[msg("Only the depositor can perform early settlement")]
    NotDepositor,

    #[msg("Deadline has not yet passed; cannot reclaim bounty")]
    DeadlineNotExpired,
}
