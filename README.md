# ReflexWork

> **คัดงานด้วย reflex ก่อนเรียก AI** — kernel ตัดสินใน ~12 ns ว่างานไหนตอบเองได้ (0 token) งานไหนต้องใช้ AI จริง ลดต้นทุน ~80% + ตรวจสอบย้อนหลังได้ด้วย BLAKE3

## 👀 สำหรับกรรมการ — เข้าใจใน 1 นาที

**ปัญหา:** ระบบ AI ทั่วไปส่งทุกคำถามเข้า LLM → แพง, ช้า, ตรวจสอบไม่ได้ (black-box)
**ทางออก:** ReflexWork วาง "ชั้นคัดกรอง" (Reflex Kernel) ไว้หน้า LLM — คัด ~80% ของงานที่ตัดสินด้วยกฎได้ออกไปตอบทันทีโดยไม่เสีย token เรียก AI เฉพาะงานที่ซับซ้อนจริง และผนึกทุกการตัดสินใจเป็น BLAKE3 proof ที่รันซ้ำได้ผลเดิม

**🔗 ลองสดได้เลย (รันจริงบน Cloudflare edge — ฟรี $0):**

| | ลิงก์ | สำหรับ |
|---|---|---|
| 🦀 ลองใน browser | [reflexwork.pages.dev/try.html](https://reflexwork.pages.dev/try.html) | เห็น kernel ตัดสิน FastPath/LLM + proof (กดปุ่ม "เทียบ FastPath vs LLM") |
| 💬 แชตบอต | [/chatbot.html](https://reflexwork.pages.dev/chatbot.html) | ถาม-ตอบ FAQ บัณฑิตวิทยาลัย — ตอบจากคู่มือ 0 token, คำถามยากเรียก Gemini จริง, กด 👍/👎 ให้ kernel เรียนรู้ |
| 📝 ยื่นคำร้อง | [/student-desk.html](https://reflexwork.pages.dev/student-desk.html) | มุมนักศึกษา + เจ้าหน้าที่ |
| 📊 แดชบอร์ด | [/dashboard.html](https://reflexwork.pages.dev/dashboard.html) | สัดส่วน fast/LLM + audit trail (ข้อมูลจริงจาก D1) |

**3 จุดที่ทำให้ต่างจาก "chatbot ทั่วไป":**
1. **ตัดสินว่า "ควรใช้ AI ไหม" ก่อน** — ไม่ใช่ search (หาคำ) ไม่ใช่ LLM (เรียกทุกครั้ง) แต่เป็นตัวคัดที่ **เรียนรู้ได้** (EMA จาก 👍/👎)
2. **เร็ว µs + 0 token บน fast path** — รันในเบราว์เซอร์ (WASM) หรือที่ edge (Worker) ก็ได้
3. **BLAKE3 audit** — รันงานเดิมซ้ำได้ proof เดิม → ตรวจสอบ AI ย้อนหลังได้ (PDPA)

**สถาปัตยกรรม live (ทั้งหมดฟรี):** LINE/เว็บ → kernel Worker (+D1 persist) → FastPath ตอบจาก KB / LLM path → Gemini proxy. โค้ด integration อยู่ใน `integrations/` (kernel-worker, llm-proxy, line-worker, line).

---

**Hackathon submissions:**
- Mahidol AI Community 2026 — AI Adoption with Kiro (MUIT × AWS, Oct 17)
- Colosseum World's Fair — Solana Global Hackathon (Oct 12)
- Superteam Thailand — AI × Solana, Agentic Payments & MCP Track (Oct 12)

---

## Architecture

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

---

## Project Structure

```
ReflexWork/
├── Cargo.toml                     # Rust workspace
├── Anchor.toml                    # Anchor workspace
├── programs/
│   └── workflow-escrow/           # Solana Anchor program (System 3)
│       ├── Cargo.toml
│       └── src/lib.rs
├── crates/
│   └── reflex-kernel/             # Modelless Reflex Engine (System 1)
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── types.rs           # TaskSpec, TaskCategory
│       │   ├── policy.rs          # Sigmoid gate, softmax, EMA
│       │   ├── attestation.rs     # BLAKE3 StateAttestation
│       │   ├── encoder.rs         # FeatureEncoder (64-dim)
│       │   ├── budget.rs          # BudgetController
│       │   ├── error.rs           # KernelError
│       │   ├── config.rs          # KernelConfig (TOML)
│       │   ├── mcp.rs             # McpClient (JSON-RPC stub)
│       │   ├── solana.rs          # AnchorClient (stub)
│       │   └── main.rs            # reflex-agent binary
│       └── benches/
│           └── policy_routing.rs  # Criterion benchmarks
├── mcp-server/                    # TypeScript MCP Server (System 2)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Server entrypoint
│       └── tools/
│           ├── definitions.ts     # Tool schema registry
│           ├── analyze-task.ts    # → Amazon Bedrock
│           ├── synthesize-document.ts
│           ├── query-knowledge-base.ts
│           ├── draft-workflow.ts
│           └── attest-and-submit.ts
├── .kiro/
│   ├── hooks/
│   │   ├── on-task-created.json   # Trigger: new task file
│   │   └── on-proof-ready.json    # Trigger: attestation ready
│   └── settings.json              # MCP server registration
└── specs/
    ├── 01-system-topology.md
    ├── 02-reflex-engine.md
    ├── 03-anchor-program.md
    └── 04-mcp-tool-interface.md
```

---

## Quick Start

### Prerequisites
- Rust 1.81+ (`rustup update stable`)
- Solana CLI 1.18+ (`sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`)
- Anchor CLI 0.30.1 (`cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.30.1`)
- Node.js 20+ (for MCP server)

### 1. Build the Reflex Kernel

```bash
cargo build --release -p reflex-kernel
```

### 2. Run Benchmarks

```bash
cargo bench --bench policy_routing
```

### 3. Build the Anchor Program

```bash
anchor build
```

### 4. Deploy to Devnet

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy
```

### 5. Build & Start the MCP Server

```bash
cd mcp-server
npm install
npm run build
npm start
```

### 6. Register your Agent

```bash
./target/release/reflex-agent register-agent
```

---

## Key Performance Targets

| Path | Latency | Cost |
|------|---------|------|
| Fast path (S1 → S3 only) | ≤ 51 µs (kernel) + ~200ms (Solana) | Zero tokens |
| LLM path (S1 → S2 → S3) | ~350–800ms (MCP) + ~200ms (Solana) | Budgeted tokens |

---

## License

MIT OR Apache-2.0
