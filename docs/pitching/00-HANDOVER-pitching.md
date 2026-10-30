# HANDOVER — Pitching Day prep (อ่านอันนี้ก่อน)

> **สำหรับ agent/คนที่มาทำต่อ:** เอกสารชุดนี้เตรียมทีม ReflexWork สำหรับรอบ
> **Pitching Day** (รอบสุดท้าย 15 ทีม) งาน Mahidol AI Community 2026 — Track A.
> เขียนไว้ให้ "ทำต่อได้ทันทีโดยไม่ต้องถามเจ้าของ" เผื่อ session เดิม quota หมด.
> อ่านไฟล์ในโฟลเดอร์นี้ตามลำดับเลขหน้า.

---

## สถานะล่าสุด (2026-10-30)

- ✅ **ผ่านรอบแรก** → เป็น 1 ใน **15 ทีมสุดท้าย** (Track A)
- 🎤 **Pitching Day:** เสาร์ **7 พ.ย. 2569** 09:00–17:00 · มหิดลสิทธาคาร ศาลายา
- ⏰ **ต้องลงทะเบียนนำเสนอภายใน 4 พ.ย. 2569 12:00 น.** (ฟอร์ม Google — ลิงก์อยู่ท้ายไฟล์)
- รูปแบบ: **ทีมละ 10 นาที = นำเสนอ 5 นาที + ตอบคำถามกรรมการ 5 นาที**
- กรรมการชุด B: 7 ท่าน (ผู้บริหาร + วิชาการ + **อุตสาหกรรม**) — คนละชุดกับรอบแรก

## เกณฑ์รอบ 2 (100 คะแนน) — ออกแบบทุกอย่างให้ตอบเกณฑ์นี้

| เกณฑ์ | คะแนน | กลยุทธ์ของเรา |
|---|---|---|
| **Impact / คุณค่าต่อมหาวิทยาลัย** | **25** | เปิดด้วย Impact ก่อน: ลดงานซ้ำ ~80% ออกจาก LLM + ตรวจสอบได้ 100% (PDPA) |
| **Implementation Readiness** | **20** | ของ **live บน production แล้ว** — ยิงสดได้ + มี production-hardening + roadmap scale |
| AI + Kiro อย่างมีประสิทธิภาพ | 15 | spec-driven (3 specs) + WASM kernel + grounded LLM + hooks/CI |
| นวัตกรรม/ความคิดสร้างสรรค์ | 15 | "คัดก่อนเรียก AI = 0 token/µs" + BLAKE3 auditable proof (System One) |
| **คุณภาพ Prototype + การสาธิต** | **15** | demo สดเสถียร + **วิดีโอ 46s สำรอง** ถ้าเน็ตล่ม |
| การนำเสนอ + ตอบคำถาม | 10 | สคริปต์ timed + **Q&A bank** (ไฟล์ 40) ซ้อมตอบคำถามยาก |

> **หมายเหตุสำคัญ:** รอบแรกให้น้ำหนัก Kiro+Feasibility ครึ่งคะแนน. รอบนี้
> **Impact (25) + Readiness (20) = 45** มาเป็นอันดับหนึ่ง และกรรมการมีสายผู้บริหาร/
> อุตสาหกรรม → **เล่าเป็นภาษาธุรกิจ/คุณค่า ก่อน technical**. de-jargon + swimlane
> ที่ทำไว้แล้วได้เปรียบมากตรงนี้.

---

## ไฟล์ในชุดนี้ (ทำเสร็จแล้ว / ต้องทำต่อ)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `00-HANDOVER-pitching.md` | ไฟล์นี้ — index + สถานะ | ✅ |
| `10-pitch-script-5min.md` | สคริปต์พูด 5 นาที timed (อ่านตามได้) | ✅ |
| `20-pitch-deck-plan.md` | โครงเด็ค pitch ~9 สไลด์ (ตัดจาก 19 สไลด์เดิม) | ✅ |
| `30-demo-runbook.md` | ลำดับคลิก demo สด + แผนสำรอง | ✅ |
| `40-qa-bank.md` | ธนาคารคำถาม-คำตอบกรรมการ (ไทย+อังกฤษ) | ✅ |
| `50-product-roadmap.md` | ต่อยอด production + scale ทั้งมหาวิทยาลัย | ✅ |

## งานที่ยังเหลือ (ให้ agent ถัดไปทำต่อ — เรียงความสำคัญ)

1. **[คน] ลงทะเบียน pitching ภายใน 4 พ.ย. 12:00** — ฟอร์ม:
   https://docs.google.com/forms/d/e/1FAIpQLSfADa2zkAt1bLA_oXA6TAR1Affd5ubazIFgvgl75wL4BdfXpA/formResponse
   (agent กรอกแทนไม่ได้ — เป็นงานเจ้าของ)
2. **[สร้างได้] เด็ค pitch จริง** — ตอนนี้มีแค่ "โครง" (`20-pitch-deck-plan.md`).
   แปลงเป็น `submissions/ui/pitch.html` (reuse CSS/palette จาก `slides.html`)
   แล้ว deploy ลง Pages → export PDF (ระวัง Chrome print bug เรื่อง fixed height
   บน host นี้ — ดู lesson ใน memory; ใช้ min-CSS ไม่ cap height).
3. **[คน+agent] ซ้อมจับเวลา** — อ่าน `10-pitch-script-5min.md` จับเวลาจริง
   ให้จบ ≤ 5:00 (ฉาก demo มักเกิน).
4. **[ตัดสินใจ] ทิศทาง demo** — ดู `50-product-roadmap.md` หัวข้อ "เลือกโฟกัส
   demo รอบ pitch"; เจ้าของถามว่าควร push production-readiness หรือ scale-
   wide — คำแนะนำอยู่ในไฟล์นั้น.

---

## สถานะโค้ด/โปรดักต์จริง (verified 2026-10-30)

- **repo:** `/Users/ozone/projects/ReflexWork` · public: github.com/ozoneRatchapon/reflexwork
- **live (ยืนยันแล้ว):**
  - Pages: https://reflexwork.pages.dev (`/chatbot.html` `/dashboard.html`
    `/slides.html` `/try.html` `/student-desk.html` — HTTP 200/308-redirect ปกติ)
  - kernel worker: https://reflexwork-kernel.solana-thailand.workers.dev
    (`/health` 200 · `/route` · `/gap` · `/gaps`)
  - llm-proxy + LINE worker (ดู `docs/handover-2026-10-16.md`)
- **CLI จริง:** `crates/reflex-kernel` (`reflex-agent route …` — local, ไม่ยิงเน็ต,
  ไม่ต้องมี Solana keypair) · **MCP server จริง:** `mcp-server/` + `crates/reflex-kernel/src/mcp.rs`
- **Kiro specs (3):** `.kiro/specs/{learning-loop, distributable-kernel, voice}/`
  — แต่ละอันมี requirements→design→tasks ครบ
- **tests:** Rust 11/11 · JS suites เขียว (รัน `cargo test --workspace` + `node --test tests/`)

## เอกสารอ้างอิงเดิม (reuse ได้ ไม่ต้องเขียนใหม่)

- `docs/executive-summary.md` — สรุปโปรดักต์ (4-way decision, learning loop, วิสัยทัศน์)
- `docs/handover-2026-10-16.md` — handover งานพัฒนา (architecture, deploy, endpoints)
- `docs/pre-demo-checklist.md` — เช็กลิสต์ก่อนขึ้นเวที (local AI, endpoints, fallback)
- `docs/production-hardening-runbook.md` — staff auth, tunnel token, D1 backup
- `submissions/demo-video-script.md` — สคริปต์วิดีโอ 5 นาที (โครง Problem→Impact)
- `submissions/slides.html` — เด็คส่งรอบแรก 19 สไลด์ (live ที่ /slides.html)
- `.kiro/specs/distributable-kernel/` — federated corpus = คำตอบ "scale ทั้งมหาวิทยาลัย"

## กฎที่ห้ามลืม (จาก product steering)

1. ข้อเท็จจริงมาจาก KB เท่านั้น — AI เรียบเรียง ไม่แต่งเอง
2. abstain ดีกว่าเดา
3. PDPA — ไม่มี PII ออกนอกเครื่อง
4. ไม่ auto-publish KB (ต้องมีคนอนุมัติ)
5. ไม่ retrain model — ปรับ corpus ไม่ปรับ weights
6. **ซื่อสัตย์กับกรรมการ** — 80% เป็น design projection ไม่ใช่ production measurement
   (radar โชว์ 60-70% จริง อ่านน่าเชื่อถือกว่าเคลม 100%)
