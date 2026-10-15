# ReflexWork — Solana / multi-hackathon variant

> This document preserves the Solana-settlement variant of ReflexWork, submitted
> to the Colosseum and Superteam Thailand hackathons. The main `README.md` now
> focuses on the Mahidol AI Community submission (edge + LLM, no chain). Nothing
> here is removed — it is kept for those submissions.

## Other submissions
- Colosseum World's Fair — Solana Global Hackathon (Oct 12)
- Superteam Thailand — AI × Solana, Agentic Payments & MCP Track (Oct 12)

## Three-system architecture (with on-chain settlement)

```
[Kiro Hook / Trigger]
       │
       ▼
[System 1: Reflex Kernel (Rust)]   ← 14–51µs, zero token cost
  sigmoid gate → route decision
  BLAKE3 state attestation
       │              │
   LLM path       Fast path
       │              │
       ▼              ▼
[System 2: MCP / Kiro]   [System 3: Solana Anchor]
  analyze_task             submit_execution_proof()
  synthesize_document      settle_bounty()
  draft_workflow           WorkflowEscrow PDA
```

System 3 lives in `programs/workflow-escrow/` (Anchor program) with the client
stub at `crates/reflex-kernel/src/solana.rs`.

## Anchor / Solana setup

### Prerequisites (chain variant)
- Rust 1.81+ (`rustup update stable`)
- Solana CLI 1.18+ (`sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`)
- Anchor CLI 0.30.1 (`cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.30.1`)

### Build & deploy the Anchor program
```bash
anchor build
solana config set --url devnet
solana airdrop 2
anchor deploy
```

### Register your agent
```bash
./target/release/reflex-agent register-agent
```

## Performance targets (chain variant)

| Path | Latency | Cost |
|------|---------|------|
| Fast path (S1 → S3 only) | ≤ 51 µs (kernel) + ~200ms (Solana) | Zero tokens |
| LLM path (S1 → S2 → S3) | ~350–800ms (MCP) + ~200ms (Solana) | Budgeted tokens |

Spec: `specs/03-anchor-program.md`.
