# ประเมิน LDT (Lattice Deduction Transformers) — ใช้กับ ReflexWork ได้ไหม

> บันทึก 2026-10-31 · ตัดสินใจ: **⬜ roadmap (ยืมแนวคิด ไม่ยืมโมเดล)** · ไม่ขึ้น slide

## แหล่งอ้างอิง
- **Lattice Deduction Transformers** — Davis, Haller, Alfarano, Santolucito (Amherst / Axiom / Barnard–Columbia)
  arXiv [2605.08605](https://arxiv.org/abs/2605.08605) v1, 9 พ.ค. 2026, cs.LG/cs.AI/cs.LO
- ข้อโต้แย้ง: *Anatomy of a Sound Neural Reasoner* — Komissarov, arXiv [2607.19635](https://arxiv.org/abs/2607.19635) (22 ก.ค. 2026)
  บอกว่าบน Sudoku ที่ให้ clue เยอะ LDT แทบตอบจบใน forward pass แรก ส่วน search แค่ลดงานเปล่า
- อ่านจาก abs + HTML (ส่วน method และตาราง Sudoku อ่านตรงจากต้นฉบับ ส่วน Maze/Snowflake อ่านผ่านสรุป ถ้าจะ quote ต้องเช็ก PDF ก่อน)

## สาระสำคัญ
- recurrent transformer ขนาด 800K–1.8M params ที่ **project latent state ลงบน lattice** ระหว่าง forward pass
  lattice = ทุกช่องเก็บ "เซตคำตอบที่ยังเป็นไปได้" เรียงตาม ⊆ (⊤ = ไม่รู้อะไร, ช่องว่างเปล่า = ขัดแย้ง)
- แต่ละรอบ **ตัด candidate** ทิ้ง (deduction) ถ้ายังไม่จบก็ branch แล้ว backtrack เมื่อขัดแย้ง แบบเดียวกับ constraint solver
- อ้างว่า "**sound but incomplete**" คืออาจอนุมานไม่ครบ แต่ไม่อนุมานผิด → "ตอบถูก หรือ **abstain**"
  Sudoku-Extreme 100% (ส่วน LLM ใหญ่ zero-shot ได้ 0%) แต่ **Maze-Hard ไม่ sound** (ตอบผิดแทนที่จะ abstain)
- เทรนบน GPU 1×B200 (Sudoku ใช้หลายนาที, Maze ~10 ชม.) **ไม่พบ code/weights ทางการ**

## ตอบคำถามใน plan (Task 5.2)
1. **ช่วย FastPath (0-token, WASM บน browser) ไหม?** — ไม่ช่วย LDT เป็นโมเดลสำหรับ *constraint puzzle* ที่โครงสร้างตายตัว (grid/maze) ต้องเทรนต่อโจทย์ ไม่ใช่ retrieval/QA ภาษาธรรมชาติ ถึงโมเดลจะเล็กพอรันใน WASM ได้ แต่ไม่มีโจทย์ของเราให้มันแก้
2. **ช่วย abstention / confidence ไหม?** — ยืม *หลักคิด* ได้ ไม่ต้องยืมโมเดล หลัก "sound-but-incomplete → abstain" ตรงกับกฎ "abstain ดีกว่าเดา" ที่เรามีอยู่แล้ว (`/route` คืน `abstain` ดู `docs/borrowed-techniques.md` §1) แต่ของเราเป็นแบบ *ระยะจาก threshold* ไม่ใช่แบบ *ตรรกะ* และตัว paper เองก็ไม่ sound บน Maze จึงไม่ควรอ้างว่า "LDT รับประกันไม่ตอบผิด"
3. **ช่วย symbolic layer ไหม?** — ส่วนนี้น่าสนใจที่สุด ยืมแค่ **lattice + candidate elimination แบบ Rust ล้วน ไม่ใช้ transformer** ได้ เช่น เรื่องสิทธิ์ (มีสิทธิ์ลงทะเบียนหลังสอบ? ได้ยกเว้นค่าธรรมเนียม? ส่งเล่มทันไหม?) ให้แต่ละเงื่อนไขตัดเซตคำตอบ `{มีสิทธิ์, ไม่มีสิทธิ์}` ลง
   - เหลือ 1 ค่า → ตอบแบบ deterministic พร้อมเหตุผล
   - เหลือ ⊤ (ข้อมูลไม่พอ) → **abstain และถามต่อ / ส่ง staff**
   - เซตว่าง (ข้อมูลขัดกัน) → abstain และ log เป็น KB conflict ใช้ตรวจ entry ซ้ำหรือเก่าได้ด้วย เช่นเคส `thesis_signature` กับ `gm_thesis_submission_14_signoff`

   ทั้งหมดนี้คือ abstract interpretation แบบพื้นฐาน ไม่ต้องใช้ ML, µs-level และอยู่ใน kernel ได้
4. **ต้นทุนลองก่อน 2026-11-07** — ใช้โมเดล LDT: ไม่คุ้ม (ไม่มี code, ต้องมีโจทย์ที่เทรนได้) ส่วนแนวคิดข้อ 3: ต้องออกแบบ schema ของ rule ดึง fact จาก KB และเขียนเทสต์ คาดว่า **เกิน 4 ชม.** → roadmap เท่านั้น

## ✅ / 🟡 / ⬜
- ✅ ทำแล้ว: — (ไม่มี)
- 🟡 มีแล้ว: abstain เมื่อไม่มั่นใจ (`/route` `abstain`), deterministic late-fee check (`thesis_late_penalty`)
- ⬜ roadmap: **rule lattice สำหรับคำถามเรื่องสิทธิ์** (Rust, ไม่ใช้ ML) + ใช้ "เซตว่าง = KB ขัดกัน" เป็น signal ให้ staff ตรวจ

## ข้อควรระวังเวลาพูดใน pitch / Q&A
- อย่าพูดว่า "เราใช้ LDT" เพราะยังไม่ได้ implement และยังไม่ได้วัด
- ถ้ากรรมการถาม: "ดูแล้ว LDT เหมาะกับ constraint puzzle เรายืมแค่หลัก *ไม่แน่ใจ = ไม่ตอบ* ซึ่งมีอยู่แล้ว ส่วน rule lattice อยู่ใน roadmap"
