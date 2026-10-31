# Field Evidence — GradMahidol AI (ทีมพันธมิตร/เคสจริงในมหิดล)

> **อ่านก่อนใช้:** เอกสารนี้สรุปการวิเคราะห์ทีม **GradMahidol AI** (น็อต/โบ๊ท/Radtiya)
> ซึ่งเป็นผู้ช่วย AI บัณฑิตวิทยาลัยมหิดลอีกทีมหนึ่ง — ใช้เป็น **หลักฐานสนามจริง**
> ว่าปัญหาที่ ReflexWork แก้มีอยู่จริงในมหิดล. วิเคราะห์จาก repo จริง (private,
> เข้าถึงผ่าน gh ด้วยสิทธิ์เจ้าของ ozoneRatchapon) + แชตทีม 10/16–10/30.
>
> **กฎการใช้ (สำคัญ):** repo เขา private + เป็นทีมพันธมิตร →
> 1. **ห้ามเอ่ยชื่อทีม/repo ในการ pitch** เว้นแต่ได้รับอนุญาตจากน็อต
> 2. อ้างเป็น **"ปากคำทีมจริง / อีกทีมในมหิดล"** ไม่ใช่ metric ที่เราวัดเอง
> 3. ห้ามเคลมว่า ReflexWork เหนือกว่า — ทั้งคู่ยัง prototype, คนละมุม

---

## 1. GradMahidol AI คืออะไร (จากของจริง)

ต่อยอดจาก **Slipumbrella** (แพลตฟอร์มสร้างทีม AI agent). สถาปัตยกรรม:

```
LINE / เว็บ (Bubble) → Go API (Gin/GORM, :8080) → Python Agent (AutoGen 0.4+, gRPC :50051)
                                                    → PostgreSQL + pgvector (RAG)
                                                    → Redis (session) + Cloudflare R2 (ไฟล์)
```

**สิ่งที่เขาทำได้จริง (แข็ง):**
- RAG เต็มรูป: pgvector + embedding (OpenRouter), **440+ บทความ knowledge** 7 หมวด
  (admissions / registration / thesis / curriculum / student_affairs / ศูนย์ภาษา / วิเทศ)
- multi-agent: GradMahidolAgent (ตอบหลัก) + Researcher→Synthesizer (ทดลอง)
- LINE inbox + **human handoff ("รับช่วงสนทนา" พัก AI รายห้อง)** + smart ticket (กำลังทำ)
- Bubble chat บนเว็บ, อ่านเว็บสด (Jina), OCR รูป (ประกาศ/ตารางคะแนน)
- **82 Python tests ผ่าน**, น้ำเสียง ค่ะ/คะ guard, welcome 7 หมวด + Quick Reply

## 2. จุดเจ็บที่เขา "เขียนยอมรับเอง" (= คุณค่า ReflexWork)

| จุดเจ็บ (คำของเขา) | ที่มา | ReflexWork แก้ |
|---|---|---|
| **"token พุ่งก้าวกระโดด / เผาฉ่ำๆ เป็นร้อยบาท (บัณฑิตจ่าย)"** | แชต 10/16, 10/28 | FastPath 0-token คัดคำถามซ้ำออกก่อนถึง LLM |
| **Dashboard cost ไม่แม่น** — เคยโชว์ `$0.00` ทั้งที่ไม่ฟรี (model_id ว่าง จับราคาไม่ได้) | `GRADMAHIDOL_PENDING_IMPROVEMENTS_2026-10-16.md` | 0-token = นับประหยัดได้จริง + BLAKE3 audit |
| **AI เบี่ยง ไม่ยอมบอกว่าตอบไม่ได้** / ต้องสั่ง "ห้ามคิดค่าปรับ กลัวมั่ว" | แชต 10/30 | abstain honest + grounded (ตัวเลขจาก KB เท่านั้น) |
| **ความจำล้าง 24 ชม.** ต้องถามใหม่ | แชต 10/30 | ❌ เราไม่ได้แก้ — อย่าเคลม |
| **ยังเป็น prototype** server ถาวรยังไม่เตรียม, เพดาน 100 คำถาม/วัน, Ticket ยังไม่ครบ | `STATUS_2026-10-30.md`, `README.md` | เราก็ยัง prototype เหมือนกัน — คนละมุม ไม่เคลมเหนือกว่า |

## 3. ReflexWork เสริมเขายังไง (layer หน้า RAG)

ReflexWork ออกแบบเป็น **ชั้นคัดกรองหน้า LLM ตัวไหนก็ได้** → เสียบหน้าสุดก่อน Go API ของเขา:
- คำถามซ้ำ (ลงทะเบียน/ค่าปรับ/กำหนดการ) → FastPath ตอบ 0 token (ไม่แตะ embedding+LLM เขา)
- เหลือที่ยาก (ค้นหลักสูตรลึก 440+) → ส่งเข้า RAG เขาตามเดิม

**ผล:** ลด token ที่เขา "เผาฉ่ำ" ตามสัดส่วนคำถามซ้ำ — ตรงจุดเจ็บที่เขาพูดเอง.
*(ยังไม่ได้ทำจริง — เป็นข้อเสนอ ไม่ใช่สิ่งที่ demo ได้)*

## 4. เรื่อง corpus — ดึงมาพิสูจน์ฝั่งเราเพิ่มได้ไหม? (ตอบคำถามเจ้าของ)

**ได้ และคุ้มมาก — แต่มีเงื่อนไข.** วิเคราะห์:

### ทำไมคุ้ม
- corpus เขาเป็น **markdown + frontmatter** (title/category/status/source_url/`source_sha256`)
  — **ฟอร์แมตตรงกับ KB เราแทบเป๊ะ** (`submissions/ui/knowledge-public/*.md`)
- ทุกไฟล์มาจาก **ประกาศทางการ (public PDF ของ graduate.mahidol.ac.th)** พร้อม source_url + sha
  → **ไม่มี PII นักศึกษา** = ปลอดภัยต่อ hard-rule #3 (PDPA) ของเรา
- 440+ บทความ 7 หมวด = ชุดคำถาม-จริงที่หลากหลายกว่า KB public เราตอนนี้ (~70 หัวข้อ)
  → ใช้ **วัด fast-path ratio / recall / abstain ของเราบนข้อมูลจริง** แทน projection

### สิ่งที่พิสูจน์ได้ถ้าได้ corpus
1. **Fast-path ratio จริง** — รันคำถามซ้ำชุดใหญ่ผ่าน kernel → วัด % ที่ตอบได้ 0-token
   (ตอนนี้เรามีแค่ 87% บน 31 คำถาม → ขยายเป็นหลักร้อยได้)
2. **Recall@1/@3 ของ TF-IDF** บน corpus ใหญ่ขึ้น (ตอนนี้ 82%/96% บน 50 เคส)
3. **Abstain correctness** — คำถามนอก corpus ต้อง abstain (ไม่มั่ว)
4. **ตัวเลข cost saving ที่จับต้องได้** — "ถ้า X คำถาม/วัน fast-path Y% = ประหยัด Z token"
   เทียบกับที่เขา "เผาฉ่ำ" จริง

### ⚠️ เงื่อนไข/กฎก่อนดึง corpus มาใช้
1. **ต้องขออนุญาตน็อตก่อน** — repo private + เป็นงานเขา. ถาม 2 อย่าง:
   (ก) ขอ **เฉพาะไฟล์ knowledge markdown** (ไม่เอา DB/PII/แชตนักศึกษา)
   (ข) ขอเอามา **วัด benchmark ฝั่งเรา** (ไม่ใช่เอาไปเป็น KB production ของเรา)
2. **ห้ามดึง DB / แชต / ticket / ไฟล์นักศึกษา** — มี PII (hard-rule #3). เอาแค่ `knowledge/*.md`
3. **เก็บใน benchmark/fixtures แยก ไม่ commit เข้า KB public เรา** เว้นแต่ได้สิทธิ์ชัดเจน
   (corpus เขา `approval_status: pending_owner_approval` — ยังไม่ได้รับรองโดยเจ้าของหน่วยงาน)
4. **อ้างอิงที่มา** — ถ้าใช้ในรายงาน/benchmark ต้องเครดิตว่าเป็น corpus ของทีม GradMahidol

### วิธีดึง (ถ้าน็อตโอเค) — ปลอดภัย ไม่เอา PII
```bash
# เอาเฉพาะ knowledge markdown จาก public announcements (ไม่มี PII)
gh api 'repos/narakorn709/gradmahidol-ai/git/trees/main?recursive=1' \
  -q '.tree[].path' | grep '^knowledge/.*\.md$'
# ดึงทีละไฟล์ด้วย gh api contents → base64 -d → เก็บใน $KIROCREW_SCRATCH ก่อน
# แล้วค่อยย้ายเข้า benchmark/ ของ ReflexWork (ไม่ใช่ knowledge-public/)
```

## 5. สถานะ / งานต่อ

- [x] อัปเดตสไลด์ Problem (`submissions/ui/pitch.html`) เพิ่มแถบ field-evidence
- [x] อัปเดต pitch script ฉาก 1 (`10-pitch-script-5min.md`) + หมายเหตุมารยาท
- [x] เพิ่ม Q&A Q3b (`40-qa-bank.md`)
- [x] **ดึง corpus มาวัด benchmark แล้ว** (เจ้าของเคลียร์สิทธิ์กับน็อตเอง) — ผล:
      recall@1 **82%** / @3 **100%** / abstain 2/2 บน 62 FAQ docs อิสระ
      → `benchmark/gradmahidol/RESULTS.md` + harness `run_benchmark.mjs`
- [ ] [เจ้าของ] ยืนยันกับน็อตว่าใช้ corpus วัด benchmark ได้ (เอกสารนี้สมมติว่าเคลียร์แล้ว)
- [ ] [ตัดสินใจ] จะเสนอ "ReflexWork เป็น layer หน้า GradMahidol" กับน็อตจริงไหม (1-page)
- [ ] [ถ้าใช้ตอน pitch] ใส่ตัวเลข benchmark 82%/100% ลงสไลด์ Readiness/Impact แทน projection

## 4b. ผล benchmark (วัดจริง 31 ต.ค.)

ดึง `knowledge/*.md` 492 ไฟล์ (440 เป็น KB doc) ลง `$KIROCREW_SCRATCH` (ไม่เข้า git)
→ สแกน PII ผ่าน (เลข 13 หลักที่เจอทั้งหมดเป็น substring ของ SHA256 ไม่ใช่เลขบัตร ปชช.)
→ รัน `_jsSearch` ของ production:

| ชุด | entries | recall@1 | recall@3 | abstain |
|---|---|---|---|---|
| ทั้ง corpus | 440 | 73% | 82% | 2/2 |
| FAQ (ไม่รวม curriculum) | 62 | **82%** | **100%** | 2/2 |

**พิสูจน์:** search เรา generalize ข้าม corpus อิสระได้ (ไม่ overfit KB ตัวเอง) +
abstain ถูกต้อง. Finding: curriculum 378 ตัว (program catalogue) ควรแยก namespace
จาก FAQ fast-path — ตรงกับที่ `distributable-kernel` spec รองรับอยู่แล้ว.

## 6. ไฟล์อ้างอิงใน repo เขา (สำหรับ agent อื่นตรวจ)
- `STATUS_2026-10-30.md` — สถานะล่าสุด (RAG, 82 tests, ยัง prototype)
- `README.md` — สถาปัตยกรรม Slipumbrella เต็ม
- `GRADMAHIDOL_PENDING_IMPROVEMENTS_2026-10-16.md` — จุดเจ็บ token/cost/handoff เขียนเอง
- `knowledge/*.md` — corpus 440+ บทความ (markdown + frontmatter + source_sha256)
