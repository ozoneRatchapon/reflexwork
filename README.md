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

**📑 เอกสารนำเสนอ:** [สไลด์ (11 หน้า)](https://reflexwork.pages.dev/slides.html) · [Concept paper](submissions/concept-paper.md) · [สคริปต์วิดีโอ demo](submissions/demo-video-script.md) · [Security report](submissions/security-report.md) · [Presentation kit](submissions/presentation-kit.md)

---

**Submission:** Mahidol AI Community 2026 — AI Adoption with Kiro (MUIT × AWS, Oct 17)
_A Solana-settlement variant (Colosseum / Superteam Thailand) is preserved in [`docs/solana-submission.md`](docs/solana-submission.md)._

---

## Architecture (Mahidol — edge, no chain)

```
LINE webhook / web pages
       │  POST /route
       ▼
[Reflex Kernel]  ← ~12 ns · sigmoid gate θ=0.72 · BLAKE3 proof · 0 token on fast path
   │                     │
 Fast path            LLM path
   │                     │
   ▼                     ▼
answer from KB      Gemini (via LLM proxy)
   │
   ▼
D1 (metrics · audit · feedback — persistent)
```

The same Rust kernel runs two ways, bit-for-bit identical:
- **in the browser** compiled to WebAssembly (`crates/reflex-wasm`) — zero backend
- **at the edge** as a Cloudflare Worker (`integrations/kernel-worker`) — with D1 persistence

## Project structure (key parts)

```
ReflexWork/
├── crates/
│   ├── reflex-kernel/        # the kernel: sigmoid gate, softmax, EMA, BLAKE3, encoder
│   └── reflex-wasm/          # kernel compiled to WASM for the browser
├── submissions/ui/           # the 4 demo pages (served on Cloudflare Pages)
│   ├── index.html            # landing
│   ├── try.html  chatbot.html  student-desk.html  dashboard.html
│   ├── knowledge-public/     # 49 approved FAQ entries (our own, from the official public FAQ)
│   └── build_knowledge_index.py  # approval-gated index builder (--all for dev)
├── integrations/
│   ├── kernel-worker/        # kernel API on Cloudflare Workers + D1
│   ├── llm-proxy/            # Gemini proxy (API key = Worker secret)
│   ├── line-worker/          # LINE webhook → kernel (service binding)
│   └── line/                 # LINE adapter PoC (node)
└── submissions/              # slides, concept paper, demo video script
```

## Run / deploy (all free tier)

```bash
# kernel locally (optional — the browser WASM needs no backend)
cargo build --release --bin reflex-serve && PORT=8787 ./target/release/reflex-serve

# kernel at the edge + D1
cd integrations/kernel-worker && npx wrangler deploy
#   (D1 bound in wrangler.toml; create with: npx wrangler d1 create reflexwork)

# LLM proxy — set the key as a secret, never in code:
cd integrations/llm-proxy && npx wrangler deploy
echo "YOUR_GEMINI_KEY" | npx wrangler secret put GEMINI_API_KEY

# the demo pages
npx wrangler pages deploy submissions/ui --project-name=reflexwork
```

## Performance

| Path | Latency | Token cost |
|------|---------|------------|
| Fast path (answered by kernel) | ~µs (browser/edge) | 0 |
| LLM path (escalated to Gemini) | ~hundreds of ms | budgeted |

## License

MIT OR Apache-2.0
