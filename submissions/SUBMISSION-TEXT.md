# ReflexWork — ข้อความสำหรับกรอกฟอร์มสมัคร (copy-paste)

> Mahidol AI Community 2026 · AI Development Challenge
> ส่งที่ https://aicommunity2026.mahidol.ac.th/
> ชุดผลงาน: Concept Paper (`submissions/concept-paper.md`) · Source Code
> (repo นี้) · Demo Video ≤5 นาที

---

## ชื่อผลงาน
**ReflexWork — ชั้นคัดกรองหน้า LLM ที่ตอบคำถามซ้ำระดับไมโครวินาทีด้วย 0 token และตรวจสอบย้อนหลังได้**

## คำโปรย (1 ประโยค)
Reflex Kernel (Rust/WASM) ตัดสินทุกคำถามในระดับไมโครวินาทีว่าตอบจากคู่มือได้เลย (FastPath, 0 token) หรือต้องส่งต่อ AI — ทุกการตัดสินใจมี BLAKE3 proof ตรวจสอบย้อนหลังได้ และ KB ยิ่งใช้ยิ่งฉลาดเองโดยไม่ต้อง retrain

## ย่อหน้าสรุป (Abstract)
แชตบอต LLM ทั่วไปเรียกโมเดล (เสียเงินและตรวจสอบไม่ได้) กับทุกคำถาม ทั้งที่
ประมาณ 80% เป็นคำถามซ้ำ/FAQ ที่ตัดสินใจด้วยกฎได้ ReflexWork วาง "ชั้นปฏิกิริยาเร็ว"
(Rust/WASM sigmoid gate) ไว้หน้า LLM เพื่อคัดคำถามซ้ำไปตอบจากคู่มือที่ตรวจแล้ว
(FastPath, 0 token, ระดับไมโครวินาที) และส่งเฉพาะ ~20% ที่ยากจริงให้ AI เรียบเรียง
แบบ grounded (ห้ามแต่งนอกคู่มือ) ทุกการตัดสินใจสร้าง BLAKE3 proof ที่ reproduce ได้
ตอบโจทย์ PDPA และธรรมาภิบาลข้อมูล ระบบยังเรียนรู้จากการใช้งานจริง: คำถามที่ตอบ
ไม่ได้ถูกบันทึกเป็น backlog (mask PII), entry ที่ผู้ใช้ไม่พอใจถูกลดความเชื่อมั่น
อัตโนมัติ และคำตอบใหม่ถูกร่างให้เจ้าหน้าที่กด approve — โตขึ้นเองโดยไม่ retrain
นอกจากนี้ยังแพ็ก kernel เป็นไลบรารี (@reflexwork/kernel) ให้หน่วยงานอื่นนำไปใช้ได้
และออกแบบ corpus กลางแบบ federated: หลายหน่วยงานช่วยกันทำให้คู่มือดีขึ้นผ่าน
"สัญญาณที่ปกปิดข้อมูลแล้ว" (ไม่มีข้อความคำถามจริงออกจากเครื่อง) โดย release ที่ผ่าน
การอนุมัติจากคนถูก anchor บน Solana เพื่อให้ตรวจสอบความถูกต้องข้ามองค์กรได้
สร้างด้วย Kiro แบบ spec-driven ตลอดกระบวนการ

## จุดเด่น (bullets)
- **ฟรี + ไมโครวินาที + ตรวจสอบได้** — ~80% ของคำถามไม่แตะโมเดลที่เสียเงิน; ทุกการตัดสินใจมี BLAKE3 proof ที่ re-run ได้ผลเดิม
- **ภาษาคนโดยไม่ใช้ AI** — template NLG + grounded hybrid: คำตอบอ่านลื่นแต่ข้อเท็จจริงมาจากคู่มือเท่านั้น ไม่ประดิษฐ์
- **ยิ่งใช้ยิ่งฉลาด** — learning loop: gap log (mask PII) + entry confidence (EMA) + auto-draft → human approve; ไม่ retrain จึงคง 0-token
- **PDPA-first** — รองรับ AI ในเครื่อง (Typhoon ภาษาไทยผ่าน Ollama), ข้อมูลไม่ออกจากเครื่อง
- **แจกจ่าย + federated** — @reflexwork/kernel (npm lib) + `reflexwork init` scaffolder; corpus กลางโตจาก signal ที่ mask แล้ว, release เซ็นชื่อ + anchor บน Solana (program deploy จริงบน devnet)
- **สร้างด้วย Kiro** — spec-driven (.kiro/specs ครบ 3 ฟีเจอร์) + steering always-on context

## การประยุกต์ใช้ AI และ Kiro (ตรงเกณฑ์รอบ 1: Kiro 20 คะแนน)
- **Kiro เป็นเครื่องมือหลักในการพัฒนา** — spec-driven workflow: ทุกฟีเจอร์ใหญ่
  เขียน requirements → design → tasks ใน `.kiro/specs/<feature>/` ก่อนลงมือ, และ
  `.kiro/steering/{product,tech,structure}.md` เป็น context ที่โหลดทุกครั้ง
  (ดูหลักฐานและการใช้จริงใน `docs/kiro-ai-sdlc.md`)
- **AI ใช้อย่างคุ้มค่า** — เรียก LLM เฉพาะคำถามที่ kernel ตัดสินว่าคลุมเครือ
  (gate ≥ 0.72) และเรียบเรียงแบบ grounded เท่านั้น ไม่ใช่เรียกทุกครั้ง

## Feasibility (ตรงเกณฑ์รอบ 1: 30 คะแนน)
- รันได้จริงวันนี้: แชตบอต + แดชบอร์ด live ที่ reflexwork.pages.dev (WASM ในเบราว์เซอร์, ไม่มี backend)
- เบา พกพาได้ (Rust → WASM), ติดตั้งเป็น service กลางของ MU ได้ และนำไปใช้ซ้ำข้ามหน่วยงานผ่าน lib + federated corpus
- ตรงบริบทมหาวิทยาลัย: งานบริการนักศึกษา/คำร้องซ้ำ ๆ (ลงทะเบียน, วิทยานิพนธ์, Turnitin)

## ลิงก์
- Live: https://reflexwork.pages.dev/chatbot.html · https://reflexwork.pages.dev/dashboard.html
- Source: https://github.com/ozoneRatchapon/reflexwork
- Solana program (devnet): https://explorer.solana.com/address/6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5?cluster=devnet
- One-pager: `submissions/one-pager.html` · Concept Paper: `submissions/concept-paper.md`

## หมายเหตุ (ตรงไปตรงมา)
- การอ่านคำตอบออกเสียง (voice) ถอดออกจาก prototype ชั่วคราว เพราะยังไม่พร้อมใช้งานจริง
- การเชื่อมฐานข้อมูลคำร้องจริงของหน่วยงาน และการ deploy anchor-webhook signer สู่ production เป็นงานต่อยอดหลังผ่านรอบคัดเลือก
