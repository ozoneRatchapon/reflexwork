# ReflexWork — System Topology

## Mermaid Diagram

```mermaid
flowchart TB
    subgraph TRIGGER["⚡ Trigger Layer"]
        KH["Kiro Hook\n(.kiro/hooks/on-task-created.json)\nEvent: file_save | git_commit | API call"]
        UI["External Trigger\n(CLI / REST endpoint / Cron)"]
    end

    subgraph S1["🦀 System 1 — Reflex Kernel (Rust/Wasm)"]
        direction TB
        PR["PolicyRouter\nw ∈ ℝᴺ sigmoid-gated"]
        BC["BudgetController\ntoken_budget, deadline_ns"]
        AT["StateAttestor\nBLAKE3(snapshot) → [u8;32]"]
        RT{"Route\nDecision"}
        PR --> BC
        BC --> AT
        AT --> RT
    end

    subgraph S2["🧠 System 2 — LLM / MCP Layer (AWS Kiro)"]
        MCP["MCP Server\n(JSON-RPC 2.0)"]
        KIRO["Kiro Agent\n(Claude / Nova via Bedrock)"]
        TOOLS["MCP Tools:\n• analyze_task\n• synthesize_document\n• query_knowledge_base\n• draft_workflow"]
        MCP --> KIRO
        KIRO --> TOOLS
    end

    subgraph S3["⛓  System 3 — Solana / Anchor Layer"]
        direction TB
        EP["Anchor Program\nworkflow-escrow\n(program_id on Devnet)"]
        ACC["Accounts:\nWorkflowEscrow\nAgentStateRecord\nTaskAttestation"]
        IX["Instructions:\ninitialize_workflow\nsubmit_execution_proof\nsettle_bounty"]
        EP --> ACC
        EP --> IX
    end

    KH -->|"task_payload: TaskSpec"| S1
    UI -->|"task_payload: TaskSpec"| S1

    RT -->|"complexity ≥ threshold\nOR open-ended NL required"| MCP
    RT -->|"deterministic path\n< 51µs"| IX

    MCP -->|"ToolResult → structured output"| AT
    AT -->|"BLAKE3 attestation hash"| IX

    IX -->|"proof: [u8;32], lamports"| ACC
    ACC -->|"emit WorkflowSettled event"| LOG["📋 Onchain Audit Log\n(verifiable by MUIT/PDPA auditors)"]
```

---

## ASCII Topology (Printable / Terminal)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REFLEXWORK TOPOLOGY                          │
│                    "Relentless Simplification"                      │
└─────────────────────────────────────────────────────────────────────┘

  TRIGGERS
  ┌──────────────────┐     ┌──────────────────────┐
  │  Kiro Hook       │     │  External (CLI/REST)  │
  │ .kiro/hooks/*.json│     │  CronJob / Webhook   │
  └────────┬─────────┘     └──────────┬────────────┘
           │   TaskSpec payload        │
           └──────────────┬────────────┘
                          ▼
  ┌─────────────────────────────────────────────────────┐
  │         SYSTEM 1 — REFLEX KERNEL (Rust/Wasm)        │
  │  ┌─────────────────────────────────────────────┐   │
  │  │  PolicyRouter                               │   │
  │  │    w ∈ ℝᴺ,  gate(x) = σ(wᵀx + b)           │   │
  │  │    route = argmax_k P(k|x; w)               │   │
  │  └───────────────┬─────────────────────────────┘   │
  │                  │                                  │
  │  ┌───────────────▼─────────────────────────────┐   │
  │  │  BudgetController                           │   │
  │  │    token_budget, deadline_ns, cost_ledger   │   │
  │  └───────────────┬─────────────────────────────┘   │
  │                  │                                  │
  │  ┌───────────────▼─────────────────────────────┐   │
  │  │  StateAttestor                              │   │
  │  │    hash = BLAKE3(snapshot_bytes)            │   │
  │  │    PersonalitySnapshot → [u8; 32]           │   │
  │  └───────────────┬─────────────────────────────┘   │
  │                  │                                  │
  │              ROUTE DECISION                        │
  │          ┌───────┴───────┐                         │
  │    NL/Complex?     Deterministic?                   │
  │          │               │                         │
  └──────────┼───────────────┼─────────────────────────┘
             │               │
             ▼               ▼ (< 51µs)
  ┌──────────────────┐   ┌───────────────────────────────┐
  │   SYSTEM 2       │   │   SYSTEM 3 — SOLANA / ANCHOR  │
  │   MCP Server     │   │                               │
  │   (JSON-RPC 2.0) │   │  ┌─────────────────────────┐ │
  │                  │   │  │  initialize_workflow()   │ │
  │   Kiro Agent     │   │  │  submit_execution_proof()│ │
  │   (via Bedrock)  │   │  │  settle_bounty()         │ │
  │                  │   │  └─────────────────────────┘ │
  │   MCP Tools:     │   │                               │
  │  • analyze_task  │   │  WorkflowEscrow Account       │
  │  • synthesize    │   │  AgentStateRecord Account     │
  │  • query_kb      │   │  TaskAttestation Account      │
  │  • draft_wf      │   └───────────────────────────────┘
  └────────┬─────────┘               │
           │                         │
           │  ToolResult +           │  BLAKE3 proof
           │  BLAKE3 attestation     │  Lamport settlement
           └──────────►──────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  Onchain Audit Log  │
              │  (Devnet / Mainnet) │
              │  PDPA-Compliant ✓   │
              └─────────────────────┘

  Latency Budget
  ─────────────────────────────────────────────
  System 1 (deterministic fast path) :  14–51 µs
  System 2 (MCP invocation, async)   : ~350–800 ms (acceptable)
  System 3 (Solana TX, 200ms era)    : ~200–400 ms
  Total worst-case (S1+S2+S3)        : < 1.25 s
  Total fast-path (S1+S3 only)       : < 1 ms
```

---

## Data Flow Summary

| Step | Actor | Action | Output |
|------|-------|--------|--------|
| 1 | Kiro Hook | Detects workflow trigger event | `TaskSpec` JSON payload |
| 2 | PolicyRouter | Sigmoid-gates task vector `x` against `w ∈ ℝᴺ` | Route decision enum |
| 3a | BudgetController | Checks token_budget, deadline_ns | Pass / Reject |
| 3b | StateAttestor | BLAKE3-hashes current snapshot | `[u8; 32]` commitment |
| 4a (NL path) | MCP Server | Dispatches to Kiro Agent via JSON-RPC | `ToolResult` struct |
| 4b (fast path) | Anchor Program | Directly calls `submit_execution_proof` | Onchain TX |
| 5 | `settle_bounty` | Verifies BLAKE3 proof, releases escrow | Lamport transfer + event |
| 6 | Audit Log | Permanent onchain record | PDPA-compliant trail |
