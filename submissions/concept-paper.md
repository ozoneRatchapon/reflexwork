# Concept Paper — ReflexWork

**งาน:** Mahidol AI Community 2026 (MUIT × AWS) — Track: AI Adoption with Kiro
**ด้านที่ส่ง:** การปรับปรุงกระบวนการทำงาน (Process Improvement)
**ผู้พัฒนา:** ทีม 2 คน — Ratchapon (Ozone), Napatsakorn
**Repository:** https://github.com/ozoneRatchapon/reflexwork

---

## 1. ชื่อผลงานและคำโปรย

**ReflexWork — ชั้นตัดสินใจเร็วระดับไมโครวินาที ที่ลดต้นทุน AI ลง 80% พร้อม audit trail ตรวจสอบย้อนหลังได้**

> ระบบจัดเส้นทางงาน (task routing) สำหรับหน่วยงานในมหาวิทยาลัย ที่คัดงาน
> deterministic ออกจาก LLM ก่อนตั้งแต่ต้นทาง จ่ายค่า AI เฉพาะงานที่ "ยาก" จริง
> และสร้างหลักฐานการตัดสินใจที่ตรวจสอบย้อนหลังได้ทุกครั้ง — สร้างด้วย Kiro + Amazon Bedrock

---

## 2. ปัญหา (Problem)

หน่วยงานในมหาวิทยาลัย (งานทะเบียน งานบุคคล งานการเงิน งานบริการนักศึกษา)
กำลังเริ่มนำ LLM/Generative AI มาช่วยงานเอกสารและคำร้อง แต่พบปัญหา 3 ข้อที่
เป็นอุปสรรคต่อการนำไปใช้จริงในวงกว้าง:

1. **ต้นทุนบานปลายและคาดเดายาก** — ทุกคำร้อง/ทุก task ถูกส่งเข้า LLM หมด
   ทั้งที่ส่วนใหญ่เป็นงานซ้ำ ๆ ที่ตัดสินใจด้วยกฎได้ (เช่น คัดประเภทคำร้อง,
   ตรวจความครบของเอกสาร, จัดลำดับความเร่งด่วน). จ่าย token ให้งานที่ไม่จำเป็น
   ต้องใช้ AI คือการเผาเงินงบประมาณ

2. **ความช้าและคอขวด** — การเรียก LLM ผ่านเครือข่ายใช้เวลา 350–800 ms ต่อครั้ง
   เมื่อปริมาณงานสูง (ช่วงเปิดเทอม/ลงทะเบียน) ระบบกลายเป็นคอขวด

3. **ตรวจสอบย้อนหลังไม่ได้ (ขาด accountability)** — เมื่อ AI ตัดสินใจแทนคน
   หน่วยงานภาครัฐ/มหาวิทยาลัยต้องตอบได้ว่า "ตัดสินใจแบบนี้เพราะอะไร ด้วยข้อมูลใด"
   เพื่อให้สอดคล้องกับ PDPA และหลักธรรมาภิบาลข้อมูล แต่ LLM แบบ black-box
   ให้คำตอบที่ reproduce ไม่ได้และไม่มีร่องรอยพิสูจน์

**แก่นของปัญหา:** รูปแบบ "เรียก LLM ทุกครั้ง" (always-call-the-LLM) แพง ช้า
และตรวจสอบไม่ได้ — ไม่เหมาะกับการ scale ในองค์กรที่มีงบจำกัดและต้องการ accountability

---

## 3. แนวคิดและวัตถุประสงค์ของ Solution

**ข้อสังเกตหลัก:** งาน workflow ในองค์กรส่วนใหญ่ (> 80%) เป็นงาน deterministic
ที่ตัดสินใจได้โดยไม่ต้องเรียก LLM เลย ควรมี "ชั้นปฏิกิริยาเร็ว" (reflex layer)
มาคัดกรองก่อน และเรียก LLM เฉพาะงานที่คลุมเครือจริง ๆ

ReflexWork เป็นสถาปัตยกรรม 3 ชั้น:

```
[Kiro Hook / ทริกเกอร์งานใหม่]
        │
        ▼
[ชั้นที่ 1: Reflex Kernel (Rust)]      ← ตัดสินใจใน ~82 µs, ต้นทุน 0 token
   เข้ารหัสงานเป็นเวกเตอร์ 64 มิติ
   sigmoid gate (threshold 0.72) ตัดสินใจเส้นทาง
   สร้าง BLAKE3 attestation (หลักฐานการตัดสินใจ)
        │                    │
   เส้นทาง LLM            เส้นทางเร็ว (fast path)
   (งานคลุมเครือ)         (งาน deterministic)
        │                    │
        ▼                    ▼
[ชั้นที่ 2: Kiro + MCP]      [ชั้นที่ 3: Audit Trail]
   Amazon Bedrock            บันทึกหลักฐานที่
   5 MCP tools               ตรวจสอบย้อนหลังได้
```

**วัตถุประสงค์:**
1. ลดต้นทุน LLM โดยคัดงาน deterministic (> 80%) ออกก่อน → จ่ายเฉพาะงานที่ยากจริง
2. ตอบสนองงานทั่วไปในระดับไมโครวินาที (fast path) ไม่ต้องรอเครือข่าย
3. สร้าง **audit trail ที่ reproduce ได้** (BLAKE3 hash chain) ทุกการตัดสินใจ
   — เปิดกล่องดำของ AI ให้ตรวจสอบได้ สอดคล้อง PDPA

**หัวใจทางเทคนิค (จากโค้ดจริงใน repo):**
- `FeatureEncoder` — แปลง `TaskSpec` เป็นเวกเตอร์ `f32` 64 มิติ (ประเภทงาน,
  ความซับซ้อน, งบ token คงเหลือ, ความเร่งด่วน, keyword tags)
- `PolicyRouter` — sigmoid gate `g = σ(wᵀx + b)`; ถ้า `g < 0.72` → fast path,
  ไม่งั้น → เรียก LLM. ขยายเป็น softmax 4 เส้นทางได้
- `StateAttestor` — BLAKE3 hash chain: `BLAKE3(input_hash ‖ state_hash ‖ output_hash)`
  = หลักฐานการตัดสินใจที่ใครก็ตรวจซ้ำได้
- การเรียนรู้ออนไลน์แบบ EMA (`ŵ = α·w + (1-α)·r·x`, α=0.97) — ปรับตัวตามผลงานจริง
  โดยไม่ต้อง retrain และไม่เรียก LLM

> แนวทางนี้สอดคล้องกับทิศทางงานวิจัยปัจจุบัน (เช่น gist.rs/Reflex) ที่เสนอ
> "decision engine ที่รันบนเครื่อง ฟรี ระดับ µs และ *abstain* เมื่อไม่มั่นใจ
> แทนที่จะเดา" ReflexWork นำหลักเดียวกันมาใช้ในบริบทกระบวนการทำงานของมหาวิทยาลัย

---

## 4. กลุ่มผู้ใช้ / ผู้ได้รับประโยชน์

| กลุ่ม | ได้ประโยชน์อย่างไร |
|---|---|
| **เจ้าหน้าที่หน่วยงาน** (ทะเบียน/บุคคล/การเงิน) | งานคัดกรอง/จัดลำดับคำร้องที่ซ้ำ ๆ ถูกจัดการอัตโนมัติในระดับ µs เหลือเวลาไปทำงานที่ต้องใช้วิจารณญาณ |
| **ผู้บริหาร / หัวหน้างาน** | เห็น audit trail ทุกการตัดสินใจของ AI ตอบคำถามตรวจสอบได้ ควบคุมงบ token ได้จริง |
| **หน่วยงาน IT (เช่น MUIT)** | ลดภาระ cost ของ LLM, ติดตั้งเป็น service กลางที่หน่วยงานอื่นเรียกใช้ซ้ำได้ |
| **นักศึกษา/ผู้ยื่นคำร้อง** | คำร้องทั่วไปได้รับการตอบสนองเร็วขึ้น ไม่ติดคอขวดช่วง peak |
| **ผู้ตรวจสอบ / งาน Compliance (PDPA)** | ตรวจย้อนหลังได้ว่า AI ตัดสินใจด้วยข้อมูลใด reproduce ผลเดิมได้ |

---

## 5. การประยุกต์ใช้ AI และ Kiro

ReflexWork ใช้ **Kiro เป็นเครื่องมือหลักในการพัฒนาและเป็นสมองของชั้นที่ 2**:

### 5.1 Kiro Hooks — ขับเคลื่อน workflow อัตโนมัติ
- `.kiro/hooks/on-task-created.json` — ทริกเกอร์เมื่อมีไฟล์ task ใหม่ → ส่งเข้า Reflex Kernel เพื่อ route
- `.kiro/hooks/on-proof-ready.json` — ทริกเกอร์เมื่อ attestation พร้อม → บันทึก audit

### 5.2 Kiro MCP Server — 5 เครื่องมือเรียกได้จาก Kiro IDE โดยตรง
ลงทะเบียนใน `.kiro/settings.json` (เซิร์ฟเวอร์ชื่อ `reflexwork`):

| MCP Tool | ทำอะไร | AWS Service |
|---|---|---|
| `analyze_task` | วิเคราะห์ความซับซ้อนของงาน | Amazon Bedrock (Claude) |
| `synthesize_document` | สรุป/ร่างเอกสาร | Amazon Bedrock (Claude) |
| `query_knowledge_base` | ค้นหา context จากฐานความรู้ | Bedrock Knowledge Bases |
| `draft_workflow` | ออกแบบขั้นตอน workflow | Amazon Bedrock (Claude) |
| `attest_and_submit` | สร้าง + บันทึกหลักฐานการตัดสินใจ | Bedrock + ชั้น audit |

### 5.3 บทบาทของ AI (เรียกเฉพาะเส้นทาง LLM)
AI (ผ่าน Bedrock) ถูกเรียกเฉพาะงานที่ Reflex Kernel ตัดสินว่า "คลุมเครือ"
(gate ≥ 0.72) เท่านั้น เช่น การสรุปคำร้องที่เขียนเป็นภาษาธรรมชาติ หรือการร่างเอกสาร
— เป็นการใช้ AI อย่างคุ้มค่า ไม่ใช่เรียกทุกครั้ง

---

## 6. คุณค่าและโอกาสในการนำไปใช้งานจริง (Feasibility)

### 6.1 ผลลัพธ์ที่วัดได้แล้ว (จากโค้ดจริง + benchmark)

| Metric | ค่าที่วัดได้ | หลักฐาน |
|---|---|---|
| `policy_route` (ตัดสินใจเส้นทาง) | **~12.2 ns** | `cargo bench --bench policy_routing` (วัดสด) |
| `feature_encode` (เข้ารหัสเวกเตอร์) | **~63.3 ns** | เดียวกัน (วัดสด) |
| Fast-path latency (end-to-end kernel) | **< 100 µs** | encode + route + BLAKE3 attest |
| ต้นทุน token เส้นทางเร็ว | **0 tokens** | ออกแบบไว้ให้ > 80% ของงานไม่แตะ LLM |
| หลักฐานการตัดสินใจ | **BLAKE3 reproducible** | `crates/reflex-kernel/src/attestation.rs` |

> ตัวเลข ns ข้างบนวัดสดด้วย Criterion บนเครื่องพัฒนา (Apple Silicon) ค่าจริงขึ้นกับฮาร์ดแวร์
> จุดสำคัญคือ **การตัดสินใจเส้นทางอยู่ในระดับนาโน-ไมโครวินาที** เทียบกับการเรียก LLM ที่ใช้ 350–800 ms

### 6.2 ทำไมถึงนำไปใช้จริงในมหาวิทยาลัยได้

- **เบาและพกพาได้** — Reflex Kernel เป็น Rust คอมไพล์เป็น native หรือ WebAssembly
  (เป้า memory ≤ 2 MB) ติดตั้งเป็น sidecar/service กลางได้โดยไม่ผูกกับ cloud ตัวใด
- **ลดต้นทุนจริง** — ยิ่งปริมาณงานสูง การคัด 80% ออกจาก LLM ยิ่งประหยัดเป็นสัดส่วน
- **สอดคล้อง PDPA/ธรรมาภิบาล** — audit trail ที่ reproduce ได้ ตอบโจทย์การตรวจสอบ
- **ต่อยอดจากของที่มี** — ใช้ Amazon Bedrock ที่ MUIT × AWS มีอยู่แล้ว ไม่ต้องตั้ง stack ใหม่

### 6.3 ขอบเขต Prototype ปัจจุบัน และงานต่อยอด (ตรงไปตรงมา)

- **ทำงานได้จริงแล้ว:** Reflex Kernel (routing + BLAKE3 + EMA) พร้อม benchmark,
  MCP server 5 tools, Kiro hooks + settings
- **เป็น stub/future work:** การเชื่อมฐานข้อมูลคำร้องจริงของหน่วยงาน และ UI
  dashboard สำหรับผู้บริหาร — เป็นขั้นถัดไปหลังผ่านรอบคัดเลือก
- **หมายเหตุทิศทาง:** ต้นแบบเดิมเคยผูกชั้น audit กับ Solana (devnet) ในบริบท
  hackathon สาย blockchain — สำหรับการใช้งานในมหาวิทยาลัย ชั้น audit ปรับเป็น
  BLAKE3 hash chain บน storage ภายในองค์กรได้ตรง ๆ โดยไม่ต้องพึ่ง blockchain
  (on-chain settlement คงไว้เป็น optional future work)

---

## 7. การสาธิต (Demo)

### 7.1 ทางเข้าใช้งาน (User Journey) — ใครใช้ระบบนี้ยังไง

ReflexWork เปิดให้ใช้งานได้ 3 ทางตามกลุ่มผู้ใช้:

| ผู้ใช้ | ใช้ยังไง | ช่องทาง (รันได้วันนี้) |
|---|---|---|
| 🎓 **นักศึกษา / ผู้ยื่นคำร้อง** | ยื่นคำร้องผ่านพอร์ทัล → ระบบคัดกรอง/ตอบรับทันทีระดับ µs | REST API `POST /route` |
| 🧑‍💼 **เจ้าหน้าที่หน่วยงาน** | วางไฟล์งานลงโฟลเดอร์ให้ route อัตโนมัติ หรือเรียกเครื่องมือจาก Kiro IDE | Kiro Hook · Kiro IDE + MCP · CLI `reflex-agent route` |
| 👔 **ผู้บริหาร / ผู้ตรวจสอบ** | ดูสถิติสรุป + ตรวจ audit trail (re-run BLAKE3 ได้ผลเดิมเสมอ) | REST API `GET /status` · BLAKE3 audit |

**เส้นทางการใช้งานจริง (end-to-end):**
```
พอร์ทัล / ไฟล์งาน
      │
      ▼
REST API (reflex-serve)  หรือ  Kiro Hook        ← ทางเข้า
      │
      ▼
Reflex Kernel  ──fast path (µs)──►  ตอบกลับทันที (คัดประเภท/ตรวจครบ/จัดลำดับ) + BLAKE3 proof
      │
      └──LLM path──►  Kiro MCP → Amazon Bedrock  (สรุป/ร่างเอกสารที่ซับซ้อน)
      │
      ▼
Audit Trail (BLAKE3 reproducible)  ──►  Dashboard ผู้บริหาร / ผู้ตรวจสอบ
```

### 7.2 รันสาธิต

**ก. REST API (ทางเข้าหลักสำหรับ end-user):**
```bash
cargo build --release --bin reflex-serve
PORT=8787 ./target/release/reflex-serve      # bind 127.0.0.1 เท่านั้น

curl -X POST localhost:8787/route \
  -H 'Content-Type: application/json' \
  -d '{"category":"ComplianceCheck","input":"ตรวจคำร้องว่าเอกสารครบไหม"}'
# → { "route":"FastPath", "kernel_us":3.46, "blake3_proof":"...", "token_cost":"0 tokens ..." }
```
มี **UI หน้าเดียวกดลองได้** ที่ `submissions/ui/index.html` (เปิดในเบราว์เซอร์ ชี้ไปที่ API)

**ข. CLI (interactive):**
```bash
reflex-agent route --category ComplianceCheck --input "..."
```

**ค. end-to-end พร้อม on-chain variant (optional):**
```bash
./demo.sh            # หรือ ./demo.sh --bench
```

Demo แสดง: การตัดสินใจของ kernel (FastPath / LLMPath) พร้อม latency,
BLAKE3 composite hash, และการ route งานผ่าน Kiro MCP

---

## 8. สรุป

ReflexWork เปลี่ยนรูปแบบการใช้ AI ในองค์กรจาก "เรียก LLM ทุกครั้ง" (แพง-ช้า-ตรวจสอบไม่ได้)
มาเป็น "คัดด้วย reflex ก่อน เรียก AI เฉพาะที่จำเป็น และพิสูจน์ได้ทุกการตัดสินใจ"
— ตอบโจทย์การปรับปรุงกระบวนการทำงานของมหาวิทยาลัยทั้งด้านต้นทุน ความเร็ว และ accountability
โดยใช้ Kiro + Amazon Bedrock เป็นแกนหลัก
