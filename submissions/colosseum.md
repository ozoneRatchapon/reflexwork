# Colosseum World's Fair — Submission Content

## Project Name
ReflexWork

## Tagline (one sentence)
Sub-millisecond AI workflow orchestration with verifiable Solana settlement.

## Description (300 words)

ReflexWork solves a fundamental tension in agentic AI systems: every AI action
needs to be fast, cheap, and verifiable — but current systems force a tradeoff
between these three properties.

**The architecture has three systems:**

**System 1 — Reflex Kernel (Rust):** A modelless routing engine that encodes
incoming tasks into a 64-dimensional feature vector, then applies a sigmoid gate
to decide whether a task needs LLM reasoning or can be settled directly. This
decision takes 12–82 microseconds with zero token cost. A BLAKE3 hash chain
(input_hash ⊕ state_hash ⊕ output_hash → composite_hash) produces a
cryptographic proof of every execution, regardless of path taken.

**System 2 — MCP Server (TypeScript/Bedrock):** When the sigmoid gate routes to
the LLM path, a Model Context Protocol server backed by Amazon Bedrock handles
analysis, document synthesis, and workflow drafting. The MCP server's
`attest_and_submit` tool bridges back to System 3.

**System 3 — Solana Anchor Program:** A WorkflowEscrow program that holds
bounties in a PDA, accepts BLAKE3 composite proofs from agents, and releases
lamports on settlement. Every execution leaves an immutable TaskAttestation PDA
onchain — a cryptographic receipt tied to the agent's wallet.

**Why this matters for Solana:** Agentic payments need sub-second latency for the
decision layer — the Reflex Kernel provides that. But they also need trustless
settlement — the Anchor program provides that. ReflexWork connects both with a
single BLAKE3 proof that travels from microsecond routing to on-chain finality.

**Live on devnet:** Program deployed, agent registered, two confirmed transactions
demonstrating the full S1→S3 path (escrow creation + proof submission).

## GitHub
https://github.com/ozoneRatchapon/reflexwork

## Solana Program (Devnet)
6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5

## Demo Transactions (Devnet)
- WorkflowEscrow init: https://explorer.solana.com/tx/5SuJjPvkPwHsV2h4gJxKETUN9irzMPqsXEyq4ug2QJ4LF74d7omiry8KyLnPZtH6zYQ33MGSHkccRq8Tzkg4EBDD?cluster=devnet
- Proof submission: https://explorer.solana.com/tx/yotun2R5E6bnNpr9ivqRC9Ex9VG5gtaBMMGRTmhS4cXZYpBBtsYhLLsAVuMkTD9tRtNntXktUJpFkUUeSs8Vc6r?cluster=devnet
- Agent wallet: 9Bz7p4RWdX7eaR4hFUeCc7aSZjDHsie8q1u8imwavkBN

## Category / Track
AI × Solana — Agentic Payments

## Team
Solo — Ozone Ratchapon

## Tech Stack
- Rust (Reflex Kernel, Anchor program)
- TypeScript (MCP server)
- Amazon Bedrock (Claude / Nova Pro)
- Solana (Anchor 1.2.0, devnet)
- Kiro IDE (hooks + MCP registration)

## Video Demo
[ TODO: record ./demo.sh run and upload to YouTube/Loom ]
[ Command: cd reflexwork && ./demo.sh ]
