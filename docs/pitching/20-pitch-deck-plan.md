# Pitch Deck Plan — ~9 สไลด์ (สำหรับพูด 5 นาที)

> เด็คเดิม `submissions/slides.html` มี **19 สไลด์** — ยาวไปสำหรับ 5 นาที
> (กฎคร่าว ๆ: 1 สไลด์ ≈ 30-40 วินาที → 5 นาที ได้ ~8-10 สไลด์).
> ไฟล์นี้คือ **โครงเด็ค pitch ใหม่** ที่ตัดเหลือเฉพาะที่พูดได้จริง + map กับสคริปต์.
>
> **วิธีสร้างเด็คจริง:** คัดลอก 9 สไลด์นี้จาก `slides.html` (reuse CSS/palette เดิม)
> ไปเป็น `submissions/ui/pitch.html` → deploy ลง Pages (`/pitch.html`).
> อย่าเขียน CSS ใหม่ — reuse ของเดิมเพื่อความสม่ำเสมอ.

---

## แผนผังสไลด์ (map กับ `10-pitch-script-5min.md`)

| # | สไลด์ | มาจากสไลด์เดิม | ฉากสคริปต์ | เวลา |
|---|-------|---------------|-----------|------|
| 1 | **Title + ทีม** | สไลด์ 1 | ฉาก 1 | 0:00 |
| 2 | **ปัญหา 3 ข้อ** (แพง/ช้า/ตรวจไม่ได้) | สไลด์ 2 | ฉาก 1 | 0:20 |
| 3 | **Swimlane** — ระบบทำงานยังไง (ภาษาคน) | สไลด์ 4 (swimlane human) | ฉาก 2 | 0:45 |
| — | *(DEMO สด — ไม่ใช้สไลด์ สลับไปเบราว์เซอร์)* | — | ฉาก 3 | 1:30 |
| 4 | **AI + Kiro** (spec-driven + AI เฉพาะที่จำเป็น) | สไลด์ 16 (Kiro SDLC) ย่อ | ฉาก 4 | 2:45 |
| 5 | **Readiness** — live production + WASM in-browser | สไลด์ 11 (dashboard) ย่อ | ฉาก 5 | 3:20 |
| 6 | **Scale** — federated corpus ทั้งมหาวิทยาลัย | สไลด์ใหม่ (จาก spec distributable-kernel) | ฉาก 5 | 3:45 |
| 7 | **Impact 3 ข้อ + วิสัยทัศน์** | สไลด์ 10/12 รวม | ฉาก 6 | 4:10 |
| 8 | **Feature Coverage Radar** (coverage จริง, ซื่อสัตย์) | สไลด์ 19 | ฉาก 6 | 4:35 |
| 9 | **ปิด** — GitHub + ชื่อทีม + QR live demo | สไลด์สุดท้าย | ฉาก 6 | 4:50 |

> **9 สไลด์ · ~5 นาที.** ถ้าซ้อมแล้วแน่น ตัดสไลด์ 8 (radar) ไปตอบใน Q&A แทนได้
> (radar เหมาะเป็น "หลักฐานความซื่อสัตย์" ตอนกรรมการถาม มากกว่าในพิตช์หลัก).

---

## รายละเอียดแต่ละสไลด์

### สไลด์ 1 — Title
- "**ReflexWork** — ชั้นคัดกรองอัจฉริยะหน้า LLM"
- subtitle: "คัดก่อนเรียก AI · ฟรี · ไมโครวินาที · ตรวจสอบได้"
- ทีม: Ratchapon (Ozone) · Napatsakorn · Mahidol AI Community 2026 · Track A
- 🦀 โลโก้ + Built with Kiro

### สไลด์ 2 — ปัญหา (เป็นภาพ 3 ไอคอน)
- 💸 **แพง** — ยิงทุกคำถามเข้า LLM ทั้งที่ 80% ซ้ำ
- 🐌 **ช้า** — รอเครือข่ายทุกครั้ง, คอขวดช่วงเปิดเทอม
- 🔍 **ตรวจไม่ได้** — AI มั่วตัวเลขได้ + ย้อนดูไม่ได้ว่าตอบอะไร (ขัด PDPA)

### สไลด์ 3 — Swimlane (ภาษาคน, ไม่มี jargon)
- 3 lane: 👤 ผู้ใช้ → 🦀 ตัวคัดกรอง → 🤖 AI/เจ้าหน้าที่
- reuse จาก slides.html สไลด์ swimlane human (หน้า 04) — **ไม่ต้องมี toggle ในพิตช์**
  (พูดภาษาคนอย่างเดียว; เทคนิคไว้ตอบ Q&A)

### สไลด์ 4 — AI + Kiro (ย่อ)
- ซ้าย: **Kiro spec-driven** — 3 specs (requirements→design→tasks) + steering + hooks + CI
- ขวา: **AI อย่างคุ้มค่า** — เรียกเฉพาะที่คลุมเครือ + grounded ("ห้ามแต่งนอกคู่มือ")
- 1 บรรทัดเด่น: "AI ไม่เคยเป็นแหล่งข้อเท็จจริง — ตัวเลขมาจากคู่มือเสมอ"

### สไลด์ 5 — Readiness (live production)
- "live วันนี้: reflexwork.pages.dev"
- Rust → WebAssembly รันในเบราว์เซอร์ 100% · 0 backend · ข้อมูลไม่ออกนอกเครื่อง
- production-hardening: staff auth · D1 backup · tunnel token (ชี้ว่าคิดเรื่อง prod แล้ว)

### สไลด์ 6 — Scale (federated corpus)
- ภาพ: หลายคณะ (A/B/C) แต่ละอันมีตัวคัดกรอง+คู่มือของตัวเอง → เชื่อมเข้า
  "central corpus (signed, human-approved)" ตรงกลาง
- จุดเด่น: **เรียนรู้ร่วมกัน แต่ไม่มีข้อมูลผู้ใช้ไหลข้าม** — มีแค่สัญญาณ masked
- อ้าง spec จริง: `.kiro/specs/distributable-kernel/` (ออกแบบครบแล้ว phase 1/3)

### สไลด์ 7 — Impact + วิสัยทัศน์
- 3 ไอคอน: 💰 ลดต้นทุน · ⚡ เร็วขึ้น · 🔒 ตรวจสอบได้
- บรรทัดวิสัยทัศน์: "**วัดความสำเร็จจากการที่คำถามซ้ำลดลง — เป้าหมายคือทำให้ตัวเองไม่จำเป็น**"

### สไลด์ 8 — Radar (ซื่อสัตย์)
- Feature Coverage Radar จาก slides.html สไลด์ 19 (ไทยนำ + อังกฤษกำกับ)
- จุดขาย: coverage จริง 60-70% บางส่วน — **โชว์ตรง ๆ = น่าเชื่อถือกว่าเคลม 100%**

### สไลด์ 9 — ปิด
- github.com/ozoneRatchapon/reflexwork
- **QR code → live demo** (ให้กรรมการสแกนลองเองหลังพิตช์ = คะแนน prototype)
- ชื่อทีม + ขอบคุณ

---

## สิ่งที่ตัดออกจากเด็ค 19 สไลด์ (ไปอยู่ Q&A/demo แทน)

- สไลด์เทคนิคลึก (sigmoid θ, TF-IDF, BLAKE3 detail) → ตอบตอน Q&A (`40-qa-bank.md`)
- REST API / endpoints detail → อยู่ใน demo + SOURCE-LINK
- learning-loop รายละเอียด → demo โชว์ abstain + gap แล้ว
- A/B Gemini vs Typhoon → Q&A ถ้าถูกถามเรื่อง local AI
- Solana/blockchain → **ไม่พูดในพิตช์** (future work บรรทัดเดียวถ้าถูกถาม)

## หมายเหตุสร้างเด็ค (ข้อควรระวัง host นี้)

- **Chrome print bug:** fixed `height` ต่อสไลด์ทำ Chrome headless crash ตอน export PDF
  บน host นี้. ใช้ min-CSS (`min-height:auto; page-break-after:always`) ไม่ cap height.
  ถ้าต้อง PDF เป๊ะหน้า → เจ้าของเปิดในเบราว์เซอร์ Cmd+P เอง.
- สำหรับ pitch วันจริง **พรีเซนต์จากเว็บสด** (`/pitch.html`) ดีกว่า PDF — สไลด์
  swimlane/radar interactive ได้ และไม่ต้องกังวล pagination.
