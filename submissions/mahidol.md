# Mahidol AI Community 2026 — Submission Content
# MUIT × AWS | Track: AI Adoption with Kiro

## ชื่อโปรเจค
ReflexWork

## Tagline
ระบบ orchestration สำหรับ AI agent ที่ตัดสินใจเร็วระดับ microsecond
และบันทึก proof ลง Solana โดยใช้ Kiro + Amazon Bedrock

## ความเชื่อมโยงกับ Kiro

ReflexWork ใช้ Kiro เป็น "สมอง" ของ System 2 ผ่าน MCP protocol:

### Kiro Hooks
```
.kiro/hooks/on-task-created.json   — trigger เมื่อมี task ใหม่
.kiro/hooks/on-proof-ready.json    — trigger เมื่อ BLAKE3 proof พร้อม
```

### Kiro MCP Server Registration
```json
// .kiro/settings.json
{
  "mcpServers": {
    "reflexwork": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
    }
  }
}
```

### MCP Tools (เรียกได้จาก Kiro IDE โดยตรง)
| Tool | ทำอะไร | AWS Service |
|------|---------|-------------|
| `analyze_task` | วิเคราะห์ task complexity | Bedrock (Claude) |
| `synthesize_document` | สรุปผลเป็น document | Bedrock (Claude) |
| `query_knowledge_base` | ค้นหา context | Bedrock Knowledge Bases |
| `draft_workflow` | ออกแบบ workflow steps | Bedrock (Claude) |
| `attest_and_submit` | submit proof ลง Solana | Bedrock + Anchor |

## AWS Services ที่ใช้
- **Amazon Bedrock** — LLM inference (Claude / Nova Pro)
- **Amazon Bedrock Knowledge Bases** — RAG สำหรับ `query_knowledge_base`

## Architecture

```
[Kiro Hook: on-task-created]
        │
        ▼
[S1: Reflex Kernel — Rust]      ← ตัดสินใจใน 12–82 µs
  sigmoid gate
  BLAKE3 attestation
        │
    ┌───┴───┐
    ▼       ▼
[S2: Kiro + MCP]    [S3: Solana]
  Bedrock tools       WorkflowEscrow
  via Kiro IDE        TaskAttestation
```

## ผลลัพธ์ที่วัดได้

| Metric | ค่าที่ได้ | เป้า |
|--------|-----------|------|
| Fast-path latency | 82 µs | ≤ 100 µs |
| Benchmark (policy_route) | 11.9 ns | — |
| Token cost (fast-path) | 0 tokens | Zero |
| On-chain proof | BLAKE3 | ✓ |

## Live Demo

```bash
git clone https://github.com/ozoneRatchapon/reflexwork
cd reflexwork
./demo.sh
```

Output แสดง:
1. Kernel decision (FastPath / LLMPath) พร้อม latency
2. BLAKE3 composite hash
3. Solana devnet transaction links

## GitHub
https://github.com/ozoneRatchapon/reflexwork

## Solana Program (Devnet)
`6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5`

## Devnet Transactions
- [init_workflow](https://explorer.solana.com/tx/5SuJjPvkPwHsV2h4gJxKETUN9irzMPqsXEyq4ug2QJ4LF74d7omiry8KyLnPZtH6zYQ33MGSHkccRq8Tzkg4EBDD?cluster=devnet)
- [submit_proof](https://explorer.solana.com/tx/yotun2R5E6bnNpr9ivqRC9Ex9VG5gtaBMMGRTmhS4cXZYpBBtsYhLLsAVuMkTD9tRtNntXktUJpFkUUeSs8Vc6r?cluster=devnet)

## Team
Solo — Ozone Ratchapon
