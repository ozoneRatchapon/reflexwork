# เทคนิคที่ยืมมา — gist.rs/reflex · katgpt · (zed)

> บันทึกจากการส่อง gist.rs/reflex (reflex·rethink·refine) + ทบทวน katgpt/zed
> เพื่อตัดสินว่าอะไรเอามาใช้กับ ReflexWork ได้จริง สิ่งที่ลงมือทำแล้วอยู่ด้านล่าง

## แหล่งอ้างอิง
- **gist.rs/reflex** — decision engine รันบนเครื่อง, µs, no model, **abstain เมื่อไม่มั่นใจ**; rethink = hosted lane เฉพาะที่ floor abstain; receipt = hash ของ input+decision; opt-in stats = counts only ไม่ใช่ text
- **katgpt** — เป็นแรงบันดาลใจของ "personality เป็น f32 weight vector" ที่ bake ไว้ (ใช้แล้วใน `specs/02-reflex-engine.md` §2.2 — ไม่มี inference API ให้ยืมเพิ่ม)
- **zed** — editor (Rust/GPUI); เทคนิคที่เกี่ยวคือ perf pattern ไม่ใช่ decision engine → ไม่ตรงงานนี้

## ✅ ทำแล้ว (PR นี้)

### 1. Abstain + Confidence (จาก gist.rs/reflex)
kernel เดิมคืนแค่ FastPath/LLM (binary) ตอนนี้ `/route` คืนเพิ่ม:
- `confidence` — ระยะของ g จาก threshold θ, normalize [0,1] (ยิ่งไกล = ยิ่งมั่นใจ)
- `abstain` — true เมื่อ `|g−θ| < 0.08` (โซนก้ำกึ่ง = ไม่มั่นใจ)

แนวคิด: **"รู้ว่าตัวเองไม่รู้"** แบบมีตัวเลข → abstain = ไป intake/staff + gap-log
แทนที่จะเดา ตรงกับ verdict "ตอบมั่วแล้วคนเลิกใช้" ที่ owner กังวล

### 2. Counts-first / PII-safe gap log (จาก gist.rs "better together")
gist.rs pool **counts เท่านั้น ไม่ใช่ text** กับ gap log เราเดิมเก็บคำถามดิบ →
ตอนนี้ `maskPII()` scrub email/phone/student-id ออกก่อนเก็บ sample:
```
"login account 6938569 email x@student.mahidol.ac.th โทร 02-849-6022"
  → "login account [id] email [email] โทร [phone]"
```
backlog ยังบอก staff ได้ว่า gap เรื่องอะไร แต่ไม่สะสม PII (ตรง PDPA)

## 🟡 ยืนยันว่ามีแล้ว (ไม่ต้องทำซ้ำ)
- **local floor + hosted-when-unsure** = reflex→rethink → เราทำ local Typhoon + fall back Gemini แล้ว (PR #35/#36) อยู่ rung เดียวกับ gist.rs
- **receipt = hash ไม่ใช่ data** → เรามี BLAKE3 proof (`blake3(input|route)`) อยู่แล้ว

## ⬜ รอพิจารณา (ยังไม่ทำ)
- **hosted rethink lane** — gist.rs ยังไม่เปิด hosted เอง; ของเรา "rethink" = ส่ง LLM ตรง ๆ ถ้าอยากมี deterministic rethink head เฉพาะเคส abstain ต้องเทรน (เกิน hackathon)
- **shared corpus + quality gate** — pool gap ข้ามทีมแล้ว retrain → ต้องมี infra กลาง, รอ product จริง
- **calibration/temperature** — gist.rs คืน calibration method; ของเราใช้ raw sigmoid พอสำหรับตอนนี้

## การใช้ downstream (ข้อเสนอ)
`abstain=true` จาก `/route` ควร override ไปทาง intake/staff ทันที (แม้ KB จะ
มี hit พอประมาณ) — เพราะ kernel บอกว่า "ก้ำกึ่ง" การส่งต่อคน + log ปลอดภัยกว่า
เดา ยังไม่ wire เข้า web/LINE flow (รอ owner เคาะว่าจะใช้ abstain band เท่าไร)
