# Demo Runbook — ลำดับคลิกเป๊ะ + แผนสำรอง

> ใช้คู่กับ `10-pitch-script-5min.md` ฉาก 3 (DEMO สด 1:30–2:45).
> **เป้าหมาย: 75 วินาที ไม่สะดุด.** ซ้อมจนทำได้โดยไม่ต้องคิด.
> verified live 2026-10-30: kernel ยิงสดได้ · FastPath + BLAKE3 + reproducible proof ✓

---

## เตรียมก่อนขึ้นเวที (ทำตาม `docs/pre-demo-checklist.md` ~10 นาทีก่อน)

1. เปิด **3 แท็บ**ค้างไว้ (เรียงซ้าย→ขวา):
   - **แท็บ 1 (จอหลัก):** https://reflexwork.pages.dev/chatbot.html
   - **แท็บ 2 (สำรอง):** https://reflexwork.pages.dev/dashboard.html
   - **แท็บ 3 (fallback วิดีโอ):** เปิดไฟล์ `submissions/video/reflexwork-demo.mp4`
     (46 วินาที) ค้างไว้ pause ที่วินาทีแรก — **ถ้าเน็ตล่มกดเล่นทันที**
2. ล้างแชทในแท็บ 1 ให้สะอาด (รีเฟรช) — เริ่มจากหน้าว่าง
3. เช็ก kernel มีชีวิต: `curl -s .../health` → `{"ok":true}` (ดู endpoint ด้านล่าง)
4. ซูมเบราว์เซอร์ ~125% ให้กรรมการหลังห้องอ่านออก
5. ปิด notification/Slack/อีเมล บนเครื่อง (กัน popup เด้งกลางพิตช์)

---

## ลำดับ demo (75 วินาที) — ทำบนแท็บ 1 (chatbot)

### Step 1 — FastPath + หลักฐาน (0–35 วิ) ★ จุดขายหลัก
1. พิมพ์: **`ส่ง Turnitin เกิน 25% ทำยังไง`** → Enter
2. **ชี้ซ้าย:** คำตอบสะอาด (ขั้นตอน + เบอร์ติดต่อจริงจากคู่มือ)
3. **ชี้ขวา (evidence panel):** ไฮไลต์ว่า —
   - `ตอบเอง` / FastPath · **0 token** (ไม่เรียก AI)
   - เจอในคู่มือหัวข้อไหน (KB match)
   - **BLAKE3 proof** — ลายเซ็นที่รันซ้ำได้ผลเดิมเป๊ะ

> พูด: "ตอบทันที ฟรี และมีหลักฐานตรวจย้อนหลังได้ทุกคำตอบ"

### Step 2 — Abstain (ไม่เดา) (35–60 วิ) ★ จุดขายความซื่อสัตย์
1. พิมพ์: **`ขอเบอร์ส่วนตัวคณบดี`** → Enter
2. ชี้: ระบบ **ไม่เดา** → บอกว่าไม่มีข้อมูล + ส่งต่อเจ้าหน้าที่ + บันทึกเป็น gap

> พูด: "ถ้าไม่รู้ มันไม่มั่ว — มันบอกตรง ๆ แล้วส่งต่อคน นี่คือ abstain ดีกว่าเดา"

### Step 3 — ยิ่งใช้ยิ่งฉลาด (60–75 วิ)
1. ชี้ **ratio bar** ด้านล่าง (สัดส่วน "ตอบเองได้" ขยับ) หรือสลับแท็บ 2 (dashboard)
   โชว์ gap backlog + fast-path %

> พูด: "ทุกคำถามที่ตอบไม่ได้ กลายเป็นสัญญาณให้เราเติมคู่มือ ระบบฉลาดขึ้นเองโดยไม่ retrain"

---

## คำถามสำรอง (ถ้าตัวหลักพลาด/อยากโชว์เพิ่ม)

ยืนยันแล้วว่า FastPath + proof:
- `สมัครเรียนปริญญาโทยังไง`
- `ขอเอกสารจบการศึกษา` (ถ้าไม่มีใน KB = abstain — ก็โชว์ความซื่อสัตย์ได้)
- off-corpus junk: `วันนี้อากาศเป็นยังไง` → abstain (ถูกต้อง)

> ⚠️ อย่าพิมพ์คำถามที่ไม่เคยลอง — เสี่ยงได้ผลแปลก. ใช้เฉพาะที่ verified ในไฟล์นี้.

---

## แผนสำรอง (ของพังกลางเวที)

| อาการ | ทำทันที |
|---|---|
| เน็ตล่ม / หน้าโหลดไม่ขึ้น | สลับ **แท็บ 3** กดเล่นวิดีโอ 46s — พูด "ขอสลับไปคลิปที่อัดไว้ครับ" |
| WASM ช้า (ปุ่มยัง disabled) | รอ 2-3 วิ (WASM boot) — ถ้านานเกิน → วิดีโอ |
| คำตอบออกแปลก | อย่าแก้สด — พูดต่อ ชี้ evidence panel ที่ยังถูก แล้วไป Q&A |
| โปรเจกเตอร์มีปัญหา | มี PDF เด็ค + วิดีโอใน USB สำรอง (เตรียมไปด้วย) |

**กฎทอง:** demo สะดุดเกิน 5 วินาที = ตัดไป fallback ทันที. อย่าเสียเวลา/สมาธิกับการแก้สด.

---

## endpoints สำหรับเช็กสุขภาพ (คัดจาก verified)

```bash
# kernel มีชีวิต
curl -s https://reflexwork-kernel.solana-thailand.workers.dev/health
# → {"ok":true}

# ยิง route จริง (ยืนยันแล้ว FastPath + BLAKE3)
curl -s -X POST https://reflexwork-kernel.solana-thailand.workers.dev/route \
  -H 'content-type: application/json' \
  -d '{"category":"ComplianceCheck","input":"ส่ง Turnitin เกิน 25% ทำยังไง"}'
# → {"route":"FastPath","blake3_proof":"...","token_cost":"0 tokens ...","confidence":0.86,...}

# สถานะรวม (fast-path %)
curl -s https://reflexwork-kernel.solana-thailand.workers.dev/status
# → {"total_routed":31,"fast_path":27,"fast_path_pct":87,"policy_version":"v11"}
```

> **field สำคัญ:** POST `/route` รับ `{"category": "...", "input": "..."}`
> (ไม่ใช่ `text`/`kind`). category เริ่มต้น = `DataQuery` ถ้าไม่ส่ง.

## ทางเลือก demo แบบ CLI (ถ้าอยากโชว์ reproducible สด บน terminal)

```bash
# local, ไม่ยิงเน็ต, ไม่ต้องมี Solana keypair — ปลอดภัยสำหรับอัด/โชว์ offline
cd crates/reflex-kernel
cargo run -- route --category ComplianceCheck --input "ส่ง Turnitin เกิน 25%"
# รันซ้ำ → BLAKE3 proof เดิมเป๊ะ (โชว์ determinism/accountability)
```
> CLI เหมาะถ้าอยากโชว์ "รันเดิมได้ proof เดิม" บนจอ terminal. แต่ demo เว็บ
> (chatbot 2 คอลัมน์) สื่อ Impact กับกรรมการสาย non-tech ได้ดีกว่า — เลือกตามผู้ชม.
