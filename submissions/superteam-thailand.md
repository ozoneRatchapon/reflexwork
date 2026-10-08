# Superteam Thailand — AI × Solana Submission Content
# Track: Agentic Payments & MCP

## ชื่อโปรเจค
ReflexWork

## One-liner
AI workflow routing ที่เร็วระดับ sub-millisecond พร้อม settlement บน Solana แบบ verifiable

## ปัญหาที่แก้
Agentic AI systems ต้องเจอ trilemma:
- **เร็ว** — decision ต้องไม่ช้าเกิน latency ของ workflow
- **ถูก** — ไม่ใช้ LLM token ทุก task
- **Verifiable** — ต้องพิสูจน์ได้ว่า agent ทำงานจริง

ทุกวันนี้ไม่มีระบบที่ได้ทั้ง 3 พร้อมกัน

## วิธีแก้

**3 ระบบทำงานร่วมกัน:**

```
Task → [S1: Reflex Kernel 12–82 µs] → FastPath → [S3: Anchor Program]
                                    ↘ LLMPath  → [S2: MCP/Bedrock] → [S3]
```

**S1 — Reflex Kernel (Rust):**
encode task เป็น 64-dim vector → sigmoid gate ตัดสิน fast/LLM path →
BLAKE3 composite hash เป็น proof ของการ execute

**S2 — MCP Server (TypeScript + Amazon Bedrock):**
5 tools: `analyze_task`, `synthesize_document`, `query_knowledge_base`,
`draft_workflow`, `attest_and_submit` — ใช้ Kiro IDE เป็น orchestrator

**S3 — Anchor Program (Solana):**
- `WorkflowEscrow` PDA — hold bounty
- `TaskAttestation` PDA — on-chain proof record
- `AgentStateRecord` PDA — reputation tracking

## MCP Track Alignment
- Full MCP server registered ใน `.kiro/settings.json`
- Kiro hooks: `on-task-created.json`, `on-proof-ready.json`
- `attest_and_submit` tool bridge S2→S3 โดยตรง

## Agentic Payments Track Alignment
- Agent ได้รับ lamports จาก WorkflowEscrow เมื่อ submit proof ครบ
- Payment ไม่ต้องมีคนกลาง — proof-triggered settlement
- Agent reputation (`reputation_bps`) track บน-chain

## Live Evidence (Devnet)

| | |
|---|---|
| Program | `6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5` |
| Agent wallet | `9Bz7p4RWdX7eaR4hFUeCc7aSZjDHsie8q1u8imwavkBN` |
| Kernel latency | 82 µs (FastPath, 0 tokens) |

Transactions:
- [init_workflow](https://explorer.solana.com/tx/5SuJjPvkPwHsV2h4gJxKETUN9irzMPqsXEyq4ug2QJ4LF74d7omiry8KyLnPZtH6zYQ33MGSHkccRq8Tzkg4EBDD?cluster=devnet)
- [submit_proof](https://explorer.solana.com/tx/yotun2R5E6bnNpr9ivqRC9Ex9VG5gtaBMMGRTmhS4cXZYpBBtsYhLLsAVuMkTD9tRtNntXktUJpFkUUeSs8Vc6r?cluster=devnet)

## GitHub
https://github.com/ozoneRatchapon/reflexwork

## รัน Demo
```bash
git clone https://github.com/ozoneRatchapon/reflexwork
cd reflexwork
./demo.sh
```

## Team
Solo — Ozone Ratchapon (Thailand)
