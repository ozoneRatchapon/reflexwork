# Mahidol AI Community 2026 — Submission Content
# MUIT × AWS | Track: AI Adoption with Kiro — ด้านการปรับปรุงกระบวนการทำงาน

> เอกสารฉบับเต็ม (Concept Paper): `submissions/concept-paper.md`

## ชื่อโปรเจค
ReflexWork

## Tagline
ชั้นตัดสินใจเร็วระดับไมโครวินาที ที่ลดต้นทุน AI ลง 80%
พร้อม audit trail ตรวจสอบย้อนหลังได้ — สร้างด้วย Kiro + Amazon Bedrock

## ปัญหาที่แก้
หน่วยงานมหาวิทยาลัยที่เริ่มใช้ LLM เจอ 3 ปัญหา: (1) ต้นทุนบานปลายเพราะเรียก
LLM ทุกครั้งทั้งที่งานส่วนใหญ่ตัดสินด้วยกฎได้ (2) ช้า/คอขวดช่วง peak
(3) ตรวจสอบย้อนหลังไม่ได้ (ขัด PDPA/ธรรมาภิบาล)

## แนวคิด
คัดงาน deterministic (> 80%) ออกจาก LLM ด้วย "reflex layer" ที่ตัดสินใจใน µs
เรียก AI เฉพาะงานคลุมเครือจริง และสร้างหลักฐานการตัดสินใจที่ reproduce ได้ทุกครั้ง

## ความเชื่อมโยงกับ Kiro

### Kiro Hooks
```
.kiro/hooks/on-task-created.json   — trigger เมื่อมี task ใหม่ → route
.kiro/hooks/on-proof-ready.json    — trigger เมื่อ attestation พร้อม → audit
```

### Kiro MCP Server Registration
```json
// .kiro/settings.json
{
  "mcp": { "servers": { "reflexwork": {
    "command": "node",
    "args": ["dist/mcp-server/index.js"]
  }}}
}
```

### MCP Tools (เรียกได้จาก Kiro IDE โดยตรง)
| Tool | ทำอะไร | AWS Service |
|------|---------|-------------|
| `analyze_task` | วิเคราะห์ task complexity | Bedrock (Claude) |
| `synthesize_document` | สรุปผลเป็น document | Bedrock (Claude) |
| `query_knowledge_base` | ค้นหา context | Bedrock Knowledge Bases |
| `draft_workflow` | ออกแบบ workflow steps | Bedrock (Claude) |
| `attest_and_submit` | สร้าง + บันทึกหลักฐานการตัดสินใจ | Bedrock + audit |

## AWS Services ที่ใช้
- **Amazon Bedrock** — LLM inference (Claude / Nova Pro)
- **Amazon Bedrock Knowledge Bases** — RAG สำหรับ `query_knowledge_base`

## Architecture

```
[Kiro Hook: on-task-created]
        │
        ▼
[S1: Reflex Kernel — Rust]      ← ตัดสินใจใน ~82 µs, ต้นทุน 0 token
  sigmoid gate (θ=0.72)
  BLAKE3 attestation
        │
    ┌───┴───┐
    ▼       ▼
[S2: Kiro + MCP]    [S3: Audit Trail]
  Bedrock tools       BLAKE3 hash chain
  via Kiro IDE        (reproducible, PDPA)
```

## ผลลัพธ์ที่วัดได้

| Metric | ค่าที่ได้ | หมายเหตุ |
|--------|-----------|------|
| Benchmark `policy_route` | ~12.2 ns | วัดสด Criterion |
| Benchmark `feature_encode` | ~63.3 ns | วัดสด Criterion |
| Fast-path latency (e2e kernel) | < 100 µs | encode+route+BLAKE3 |
| Token cost (fast-path) | 0 tokens | > 80% งานไม่แตะ LLM |
| หลักฐานการตัดสินใจ | BLAKE3 reproducible | ✓ |

## Live Demo

```bash
git clone https://github.com/ozoneRatchapon/reflexwork
cd reflexwork
./demo.sh            # --bench เพื่อดู benchmark
```

Output แสดง:
1. Kernel decision (FastPath / LLMPath) พร้อม latency
2. BLAKE3 composite hash
3. การ route งานผ่าน Kiro MCP

## ขอบเขต Prototype และงานต่อยอด
- **ทำงานได้จริง:** Reflex Kernel (routing + BLAKE3 + EMA) + benchmark, MCP 5 tools, Kiro hooks
- **Future work:** เชื่อมฐานข้อมูลคำร้องจริง + UI dashboard ผู้บริหาร
- **หมายเหตุ:** ต้นแบบเดิมเคยผูก audit กับ Solana devnet (บริบท hackathon blockchain)
  — สำหรับมหาวิทยาลัย ชั้น audit ใช้ BLAKE3 hash chain บน storage ภายในองค์กรได้ตรง ๆ
  (on-chain เป็น optional future work)

## GitHub
https://github.com/ozoneRatchapon/reflexwork

## Team
Ratchapon (Ozone) · Napatsakorn
