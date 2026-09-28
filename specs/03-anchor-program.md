# ReflexWork — Solana Anchor Program Specification

## Program: `workflow-escrow`

**Network**: Solana Devnet (target Mainnet-Beta post-audit)  
**Anchor Version**: 0.30.x  
**Rust Edition**: 2021  
**SIMD-0525 Alignment**: All instructions designed for ≤ 200ms slot confirmation

---

## 1. Program Overview

The `workflow-escrow` Anchor program is the **verifiable settlement layer** of ReflexWork.
It holds lamport escrow for tasks, accepts BLAKE3 execution proofs from the Reflex Kernel,
and releases payments atomically upon verified proof submission.

Core guarantees:
1. **Escrow atomicity** — funds only release when a valid BLAKE3 proof is submitted.
2. **Replay protection** — each `TaskAttestation` PDA is derived from `composite_hash`,
   making double-spend impossible.
3. **Timelock expiry** — bounties can be reclaimed by the depositor after `deadline_unix_s`.
4. **Auditable trail** — every state transition emits a structured Anchor event.

---

## 2. Account Structures

### 2.1 WorkflowEscrow

Holds the lamport deposit and defines the workflow parameters.

```rust
#[account]
pub struct WorkflowEscrow {
    /// The authority who created and funded this escrow.
    pub depositor: Pubkey,              // 32 bytes

    /// The expected executing agent's public key.
    /// If None, any agent that submits a valid proof can claim.
    pub authorized_agent: Option<Pubkey>, // 33 bytes (1 discriminant + 32)

    /// Unique workflow identifier (UUIDv4 as [u8; 16]).
    pub workflow_id: [u8; 16],          // 16 bytes

    /// Escrow amount in lamports deposited for this workflow.
    pub bounty_lamports: u64,           // 8 bytes

    /// Unix timestamp (seconds) after which depositor can reclaim funds.
    pub deadline_unix_s: i64,           // 8 bytes

    /// Status of this escrow.
    pub status: EscrowStatus,           // 1 byte (enum)

    /// Number of execution proofs submitted (for multi-step workflows).
    pub proof_count: u8,                // 1 byte

    /// Maximum proofs allowed before auto-settling (1 for simple tasks).
    pub max_proofs: u8,                 // 1 byte

    /// BLAKE3 hash of the original TaskSpec (set at initialize time).
    pub task_spec_hash: [u8; 32],       // 32 bytes

    /// Anchor discriminator reserved space + alignment padding.
    pub _padding: [u8; 6],             // 6 bytes → total: 138 bytes + 8 disc = 146
}

/// Total space: 8 (discriminator) + 138 = 146 bytes
impl WorkflowEscrow {
    pub const LEN: usize = 8 + 32 + 33 + 16 + 8 + 8 + 1 + 1 + 1 + 32 + 6;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Active,       // 0 — awaiting proof submission
    Settled,      // 1 — bounty paid out
    Expired,      // 2 — deadline passed, reclaimed
    Disputed,     // 3 — proof rejected, under review
}
```

**PDA Derivation**:
```
seeds = [b"escrow", depositor.key().as_ref(), workflow_id.as_ref()]
bump   = canonical PDA bump
```

---

### 2.2 AgentStateRecord

Tracks the onchain reputation and execution history of a Reflex Agent.

```rust
#[account]
pub struct AgentStateRecord {
    /// The agent's wallet public key (owner of this record).
    pub agent: Pubkey,                  // 32 bytes

    /// Total number of tasks successfully settled.
    pub tasks_completed: u64,           // 8 bytes

    /// Total number of proof submissions (including failures).
    pub proofs_submitted: u64,          // 8 bytes

    /// Total lamports earned across all settled tasks.
    pub total_earned_lamports: u64,     // 8 bytes

    /// Total lamports slashed due to invalid proofs.
    pub total_slashed_lamports: u64,    // 8 bytes

    /// Last BLAKE3 composite hash submitted by this agent.
    pub last_composite_hash: [u8; 32],  // 32 bytes

    /// Unix timestamp of last successful settlement.
    pub last_settled_unix_s: i64,       // 8 bytes

    /// Agent personality snapshot version at time of last submission.
    pub policy_version: u32,            // 4 bytes

    /// Reputation score: 0–10000 (basis points, starts at 5000).
    pub reputation_bps: u16,            // 2 bytes

    /// Padding for alignment.
    pub _padding: [u8; 2],              // 2 bytes → total: 114 + 8 disc = 122
}

impl AgentStateRecord {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 32 + 8 + 4 + 2 + 2;
    pub const INITIAL_REPUTATION: u16 = 5000;
    pub const MAX_REPUTATION: u16 = 10000;
    pub const SLASH_AMOUNT_BPS: u16 = 100; // -1% per failed proof
}
```

**PDA Derivation**:
```
seeds = [b"agent", agent.key().as_ref()]
bump   = canonical PDA bump
```

---

### 2.3 TaskAttestation

Immutable record of a single execution proof. One per submitted proof.

```rust
#[account]
pub struct TaskAttestation {
    /// The workflow this attestation belongs to.
    pub workflow_escrow: Pubkey,        // 32 bytes

    /// The agent that submitted this proof.
    pub agent: Pubkey,                  // 32 bytes

    /// UUIDv4 of the specific task (as [u8; 16]).
    pub task_id: [u8; 16],             // 16 bytes

    /// BLAKE3(canonical(task_spec))
    pub input_hash: [u8; 32],          // 32 bytes

    /// BLAKE3(canonical(personality_snapshot))
    pub state_hash: [u8; 32],          // 32 bytes

    /// BLAKE3(canonical(route_decision + tool_result))
    pub output_hash: [u8; 32],         // 32 bytes

    /// BLAKE3(input_hash || state_hash || output_hash)
    /// Primary proof key — used as PDA seed to prevent replays.
    pub composite_hash: [u8; 32],      // 32 bytes

    /// Wall-clock execution time in nanoseconds (from Reflex Kernel).
    pub execution_ns: u64,             // 8 bytes

    /// Route taken by the Reflex Kernel.
    pub route_taken: u8,               // 1 byte (0=FastPath,1=McpAnalyze,2=McpSynth,3=Rejected)

    /// Unix timestamp (seconds) when this proof was submitted.
    pub submitted_at_unix_s: i64,      // 8 bytes

    /// Whether the escrow was settled by this attestation.
    pub settled: bool,                 // 1 byte

    /// Padding.
    pub _padding: [u8; 6],            // 6 bytes → total: 314 + 8 disc = 322
}

impl TaskAttestation {
    pub const LEN: usize = 8 + 32 + 32 + 16 + 32 + 32 + 32 + 32 + 8 + 1 + 8 + 1 + 6;
}
```

**PDA Derivation** (replay-proof via composite_hash):
```
seeds = [b"attest", composite_hash.as_ref()]
bump   = canonical PDA bump
```

---

## 3. Instruction Handlers

### 3.1 `initialize_workflow`

Creates a new `WorkflowEscrow` PDA and deposits lamports into it.

```
Accounts:
┌─────────────────────────┬──────────┬────────┬─────────────────────────────────────┐
│ Account                 │ Mut      │ Signer │ Description                         │
├─────────────────────────┼──────────┼────────┼─────────────────────────────────────┤
│ depositor               │ ✓        │ ✓      │ Payer and authority                 │
│ escrow                  │ ✓ (init) │        │ WorkflowEscrow PDA (created here)   │
│ system_program          │          │        │ Required for account creation        │
└─────────────────────────┴──────────┴────────┴─────────────────────────────────────┘

Parameters:
  workflow_id:        [u8; 16]   — UUIDv4 bytes
  bounty_lamports:    u64        — must be ≥ MIN_BOUNTY (10_000 lamports)
  deadline_unix_s:    i64        — must be > Clock::get().unix_timestamp + MIN_DEADLINE_SECS
  authorized_agent:   Option<Pubkey>
  task_spec_hash:     [u8; 32]   — BLAKE3 hash of TaskSpec (computed offchain)
  max_proofs:         u8         — 1 for simple tasks, N for multi-step

Constraints:
  bounty_lamports >= MIN_BOUNTY
  deadline_unix_s > now + MIN_DEADLINE_SECS (= 30s)
  max_proofs >= 1 && max_proofs <= 10

Side Effects:
  - Transfers bounty_lamports from depositor to escrow PDA
  - Sets escrow.status = EscrowStatus::Active
  - Emits: WorkflowInitialized { escrow, depositor, workflow_id, bounty_lamports }
```

---

### 3.2 `submit_execution_proof`

Verifies a BLAKE3 composite proof submitted by a Reflex Agent. If valid and `proof_count`
reaches `max_proofs`, automatically triggers settlement.

```
Accounts:
┌──────────────────────────┬──────────┬────────┬──────────────────────────────────────────┐
│ Account                  │ Mut      │ Signer │ Description                              │
├──────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ agent                    │ ✓        │ ✓      │ Reflex Agent submitting the proof         │
│ escrow                   │ ✓        │        │ WorkflowEscrow (must be Active)           │
│ attestation              │ ✓ (init) │        │ TaskAttestation PDA (created here)        │
│ agent_record             │ ✓        │        │ AgentStateRecord (must exist)             │
│ system_program           │          │        │ Required for account creation             │
│ clock                    │          │        │ Sysvar for timestamp                      │
└──────────────────────────┴──────────┴────────┴──────────────────────────────────────────┘

Parameters:
  task_id:           [u8; 16]   — matches TaskSpec.id
  input_hash:        [u8; 32]
  state_hash:        [u8; 32]
  output_hash:       [u8; 32]
  composite_hash:    [u8; 32]   — BLAKE3(input||state||output)
  execution_ns:      u64
  route_taken:       u8

Constraints:
  escrow.status == EscrowStatus::Active
  clock.unix_timestamp <= escrow.deadline_unix_s
  if authorized_agent.is_some(): agent.key() == escrow.authorized_agent
  composite_hash == BLAKE3(input_hash || state_hash || output_hash)   ← verified onchain
  attestation PDA must not already exist (replay protection)

Onchain BLAKE3 Verification:
  // Note: full BLAKE3 is compute-unit heavy; use pre-image + hash check pattern
  // The program verifies: blake3_verify(input_hash, state_hash, output_hash, composite_hash)
  // Using a 96-byte hash chain precomputed and verified within CU budget.

Side Effects:
  - Creates TaskAttestation PDA (immutable record)
  - Increments escrow.proof_count
  - Increments agent_record.proofs_submitted
  - If proof_count == max_proofs: triggers internal settle logic
  - Emits: ProofSubmitted { attestation, agent, composite_hash, execution_ns }
  - Emits (if settled): WorkflowSettled { escrow, agent, bounty_lamports }
```

---

### 3.3 `settle_bounty`

Explicit settlement instruction. Releases escrow lamports to the agent.
Can be called by depositor (early release) or automatically after `max_proofs`.

```
Accounts:
┌──────────────────────────┬──────────┬────────┬──────────────────────────────────────────┐
│ Account                  │ Mut      │ Signer │ Description                              │
├──────────────────────────┼──────────┼────────┼──────────────────────────────────────────┤
│ authority                │ ✓        │ ✓      │ depositor (early) OR agent (auto-settle)  │
│ escrow                   │ ✓        │        │ WorkflowEscrow (must be Active)           │
│ agent                    │ ✓        │        │ Recipient of bounty lamports              │
│ agent_record             │ ✓        │        │ AgentStateRecord                          │
│ system_program           │          │        │                                           │
└──────────────────────────┴──────────┴────────┴──────────────────────────────────────────┘

Parameters: (none — all data read from escrow account)

Constraints:
  escrow.status == EscrowStatus::Active
  authority.key() == escrow.depositor  OR  escrow.proof_count >= escrow.max_proofs

Side Effects:
  - Transfers escrow.bounty_lamports to agent
  - Sets escrow.status = EscrowStatus::Settled
  - Increments agent_record.tasks_completed
  - Adds bounty to agent_record.total_earned_lamports
  - Updates agent_record.reputation_bps (min MAX_REPUTATION, += 10 bps per settlement)
  - Emits: WorkflowSettled { escrow, agent, bounty_lamports, timestamp }
```

---

### 3.4 `reclaim_expired_bounty`

Allows depositor to reclaim funds after deadline passes without valid proof.

```
Accounts:
  depositor (mut, signer)
  escrow    (mut, must be Active and deadline < now)

Constraints:
  clock.unix_timestamp > escrow.deadline_unix_s
  escrow.status == EscrowStatus::Active

Side Effects:
  - Transfers lamports back to depositor
  - Sets escrow.status = EscrowStatus::Expired
  - Emits: BountyReclaimed { escrow, depositor, lamports }
```

---

### 3.5 `register_agent`

One-time setup: creates an `AgentStateRecord` PDA for a new agent.

```
Accounts:
  agent        (mut, signer)
  agent_record (mut, init)
  system_program

Side Effects:
  - Initializes AgentStateRecord with defaults
  - reputation_bps = INITIAL_REPUTATION (5000)
  - Emits: AgentRegistered { agent, timestamp }
```

---

## 4. Error Codes

```rust
#[error_code]
pub enum ReflexError {
    #[msg("Bounty amount is below the minimum threshold (10,000 lamports)")]
    BountyTooLow,                    // 6000

    #[msg("Deadline must be at least 30 seconds in the future")]
    DeadlineTooSoon,                 // 6001

    #[msg("The workflow escrow is not in Active status")]
    EscrowNotActive,                 // 6002

    #[msg("The submission deadline has passed")]
    DeadlineExpired,                 // 6003

    #[msg("This agent is not authorized to execute this workflow")]
    UnauthorizedAgent,               // 6004

    #[msg("The submitted BLAKE3 composite hash does not match the proof")]
    InvalidProof,                    // 6005

    #[msg("Maximum number of proofs for this workflow has already been reached")]
    ProofLimitReached,               // 6006

    #[msg("Arithmetic overflow in lamport calculation")]
    ArithmeticOverflow,              // 6007

    #[msg("Agent record does not exist; call register_agent first")]
    AgentNotRegistered,              // 6008

    #[msg("max_proofs must be between 1 and 10")]
    InvalidMaxProofs,                // 6009

    #[msg("Composite hash pre-image verification failed")]
    HashPreimageInvalid,             // 6010

    #[msg("Only the depositor can perform early settlement")]
    NotDepositor,                    // 6011

    #[msg("Deadline has not yet passed; cannot reclaim bounty")]
    DeadlineNotExpired,              // 6012
}
```

---

## 5. Events

```rust
#[event]
pub struct WorkflowInitialized {
    pub escrow:          Pubkey,
    pub depositor:       Pubkey,
    pub workflow_id:     [u8; 16],
    pub bounty_lamports: u64,
    pub deadline_unix_s: i64,
}

#[event]
pub struct ProofSubmitted {
    pub attestation:    Pubkey,
    pub agent:          Pubkey,
    pub workflow_id:    [u8; 16],
    pub composite_hash: [u8; 32],
    pub execution_ns:   u64,
    pub route_taken:    u8,
}

#[event]
pub struct WorkflowSettled {
    pub escrow:          Pubkey,
    pub agent:           Pubkey,
    pub bounty_lamports: u64,
    pub timestamp_unix_s: i64,
}

#[event]
pub struct BountyReclaimed {
    pub escrow:          Pubkey,
    pub depositor:       Pubkey,
    pub lamports:        u64,
}

#[event]
pub struct AgentRegistered {
    pub agent:           Pubkey,
    pub timestamp_unix_s: i64,
}
```

---

## 6. Compute Unit Budget

| Instruction              | Estimated CU | Notes |
|--------------------------|-------------|-------|
| `initialize_workflow`    | ~12,000     | Account init + transfer |
| `submit_execution_proof` | ~28,000     | BLAKE3 verify + account init |
| `settle_bounty`          | ~8,000      | Lamport transfer + state update |
| `reclaim_expired_bounty` | ~6,000      | Simple check + transfer |
| `register_agent`         | ~8,000      | Account init only |

All instructions fit comfortably within the 200,000 CU default limit.
Set priority fees via `ComputeBudgetProgram::set_compute_unit_price` in client.

---

## 7. Constants

```rust
pub const MIN_BOUNTY: u64 = 10_000;         // lamports
pub const MIN_DEADLINE_SECS: i64 = 30;      // seconds
pub const MAX_PROOF_COUNT: u8 = 10;
pub const REPUTATION_PER_SETTLEMENT: u16 = 10; // basis points
pub const SLASH_PER_INVALID_PROOF: u16 = 100;  // basis points
```

---

## 8. Security Considerations

1. **Replay protection**: `TaskAttestation` PDA is seeded by `composite_hash`. Since
   BLAKE3 is collision-resistant, the same proof cannot be submitted twice.

2. **Reentrancy**: Anchor's native account ownership model prevents reentrancy. The
   `escrow.status` field is set atomically within a single instruction execution.

3. **Overflow safety**: All lamport arithmetic uses `checked_add` / `checked_sub`
   with `ReflexError::ArithmeticOverflow` on failure.

4. **Clock manipulation**: Deadline checks use `Clock::get().unix_timestamp` (Solana
   sysvar), which cannot be manipulated by validators within ±1 slot tolerance.

5. **Authority validation**: All privileged operations validate `ctx.accounts.authority.key()`
   against stored `escrow.depositor`, preventing front-running by unauthorized parties.

6. **PDPA Compliance**: No PII is stored onchain. The `task_spec_hash` is a one-way
   commitment — the original TaskSpec (potentially containing user data) stays offchain.
