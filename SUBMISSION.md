# ReflexWork — Hackathon Submission

> Sub-millisecond AI workflow orchestration with verifiable Solana settlement.

---

## Submissions

| Hackathon | Deadline | Track |
|-----------|----------|-------|
| Colosseum World's Fair — Solana Global Hackathon | Oct 12 | AI × Solana |
| Superteam Thailand — AI × Solana | Oct 12 | Agentic Payments & MCP Track |
| Mahidol AI Community 2026 (MUIT × AWS) | Oct 17 | AI Adoption with Kiro |

---

## What is ReflexWork?

ReflexWork is a three-system architecture for AI agents that need both speed and
on-chain accountability:

```
[Kiro Hook / Trigger]
        │
        ▼
[S1: Reflex Kernel — Rust]     ← 12–82 µs, zero token cost
  64-dim feature encoder
  sigmoid gate (threshold 0.72)
  BLAKE3 state attestation
        │               │
    LLM path        Fast path
        │               │
        ▼               ▼
[S2: MCP / Kiro]   [S3: Solana Anchor]
  analyze_task        submit_execution_proof()
  draft_workflow      WorkflowEscrow PDA
  attest_and_submit   TaskAttestation PDA
```

**Key insight:** Most AI workflow tasks are deterministic enough to bypass LLM
entirely. The Reflex Kernel decides in < 100 µs whether to use the LLM path or
go direct to on-chain settlement — with a cryptographic proof either way.

---

## Live Devnet Evidence

### Deployed Program
```
Program ID   : 6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5
Network      : Solana Devnet
Explorer     : https://explorer.solana.com/address/6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5?cluster=devnet
```

### Smoke Test Transactions (Oct 8, 2026)
```
init_workflow tx  : LG93kR5gq2pCmgfLm3grHiaPiYbTQwxKy1qibc8i8kj1W74StewLwxUzAottr6ZBjjWpYHABrWomMabdxaH5oek
submit_proof tx   : 2Q8jZpTFWdoFRuroHLbpbaZ6BfLKxFoXLwwxWRiBJCQ5Bm1ewSLhcdEcfbn192cd7TBqxdiySGCB1eu1HfLa69p4
AttestationPDA    : BRDxmeX3ZQ58dW5y2EiwcPb7AtjLxe4z4TffG7tFE3qB
Kernel latency    : 82 µs  (FastPath — zero LLM tokens)
```

Explorer links:
- [init_workflow](https://explorer.solana.com/tx/LG93kR5gq2pCmgfLm3grHiaPiYbTQwxKy1qibc8i8kj1W74StewLwxUzAottr6ZBjjWpYHABrWomMabdxaH5oek?cluster=devnet)
- [submit_proof](https://explorer.solana.com/tx/2Q8jZpTFWdoFRuroHLbpbaZ6BfLKxFoXLwwxWRiBJCQ5Bm1ewSLhcdEcfbn192cd7TBqxdiySGCB1eu1HfLa69p4?cluster=devnet)

---

## Benchmark Results

Run: `cargo bench --bench policy_routing`

| Benchmark | Time |
|-----------|------|
| `policy_route` | 11.9 ns |
| `feature_encode` | 38.2 ns |

Full end-to-end kernel (encode + route + BLAKE3 attest): **82 µs**

---

## Quick Start (Judges)

### Prerequisites
```bash
# Rust 1.81+
rustup update stable

# Solana CLI 3.1.x
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Node.js 20+
```

### Run Demo
```bash
git clone https://github.com/ozoneRatchapon/reflexwork
cd reflexwork
chmod +x demo.sh
./demo.sh
```

The demo script:
1. Builds the Reflex Kernel (Rust)
2. Shows kernel policy status
3. Builds the MCP server (TypeScript)
4. Verifies the deployed Anchor program on devnet
5. Runs end-to-end: creates an escrow, routes a task, submits BLAKE3 proof onchain

### Run with Benchmarks
```bash
./demo.sh --bench
```

---

## Architecture Details

### System 1 — Reflex Kernel (`crates/reflex-kernel/`)
- **FeatureEncoder**: maps `TaskSpec` → 64-dim `f32` vector (one-hot category, priority, complexity, deadline urgency, context tags)
- **PolicyRouter**: sigmoid gate over weighted feature dot-product; EMA weight adaptation
- **StateAttestor**: BLAKE3 hash chain over `input_hash ⊕ state_hash ⊕ output_hash → composite_hash`
- **BudgetController**: enforces token budget and deadline hard stops

### System 2 — MCP Server (`mcp-server/`)
Five MCP tools exposed over JSON-RPC 2.0 / stdio:
| Tool | Backend |
|------|---------|
| `analyze_task` | Amazon Bedrock (Claude) |
| `synthesize_document` | Amazon Bedrock (Claude) |
| `query_knowledge_base` | Amazon Bedrock Knowledge Bases |
| `draft_workflow` | Amazon Bedrock (Claude) |
| `attest_and_submit` | Calls S3 Anchor program |

### System 3 — Anchor Program (`programs/workflow-escrow/`)
Three instructions:
| Instruction | Description |
|-------------|-------------|
| `initialize_workflow` | Creates `WorkflowEscrow` PDA, deposits bounty lamports |
| `submit_execution_proof` | Verifies BLAKE3 composite hash, creates `TaskAttestation` PDA |
| `settle_bounty` | Releases lamports to agent after proof acceptance |

PDAs:
- `WorkflowEscrow` — `["escrow", depositor, workflow_id]`
- `TaskAttestation` — `["attest", composite_hash]`
- `AgentStateRecord` — `["agent", agent_pubkey]`

---

## Hackathon Track Alignment

### Colosseum / Superteam Thailand — AI × Solana, Agentic Payments & MCP Track
- **Agentic payments**: WorkflowEscrow holds bounty; agent earns on proof submission
- **MCP**: Full MCP server with 5 tools, registered in `.kiro/settings.json`
- **Solana**: Live on devnet, verifiable program ID, two confirmed transactions

### Mahidol AI Community 2026 — AI Adoption with Kiro
- **Kiro hooks**: `.kiro/hooks/on-task-created.json`, `.kiro/hooks/on-proof-ready.json`
- **Kiro MCP**: Server registered in `.kiro/settings.json`, tools callable from Kiro IDE
- **AWS Bedrock**: All LLM-path tools backed by `amazon.nova-pro-v1:0` via Bedrock

---

## License

MIT OR Apache-2.0
