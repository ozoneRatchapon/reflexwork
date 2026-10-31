# Benchmark Results — ReflexWork search × GradMahidol corpus

> **วันที่วัด:** 31 ตุลาคม 2569
> **Corpus:** knowledge markdown ของทีม GradMahidol AI (ประกาศทางการ, ไม่มี PII —
> provenance + กฎอนุญาต/PDPA ดู `docs/pitching/70-field-evidence-gradmahidol.md`)
> **โค้ดที่วัด:** `_jsSearch` ของ production (สกัดจาก `submissions/ui/chatbot.html`) —
> อัลกอริทึมเดียวกับที่ deploy จริง ไม่ใช่สำเนา
> **คำสั่ง:** `CORPUS=<path>/knowledge [EXCLUDE_CURRICULUM=1] node benchmark/gradmahidol/run_benchmark.mjs`

## สรุปผล (วัดจริง ไม่ใช่ projection)

| ชุด | KB entries | recall@1 | recall@3 | abstain off-corpus |
|---|---|---|---|---|
| **ทั้ง corpus** | 440 | 73% (8/11) | 82% (9/11) | 2/2 ✓ |
| **เฉพาะ FAQ (ไม่รวม curriculum)** | 62 | **82% (9/11)** | **100% (11/11)** | 2/2 ✓ |

> คำถามทดสอบ 11 ข้อ = คำถามจริงจาก log ทดสอบ LINE/แชตของทีม GradMahidol เอง
> (Turnitin, ลงทะเบียน, ลาพัก, transcript, ค่าสมัคร, ทุน ป.เอก, อ้างอิง APA ฯลฯ)
> + off-corpus junk 2 ข้อ (อากาศ, ร้านกาแฟ) ที่ต้อง abstain

## สิ่งที่พิสูจน์ได้

1. **search ของ ReflexWork generalize ข้าม corpus อิสระได้** — recall@1 82% / @3 100%
   บน corpus ที่ *ไม่เคยเห็นมาก่อน* ใกล้เคียงกับ 82%/96% บน KB เราเอง → ไม่ใช่ overfit
2. **abstain ทำงานถูก** — off-corpus ได้ blended score s=1.0 ต่ำกว่า gate → ไม่มั่ว
   (ตรงกับ hard-rule "abstain over guess")
3. **ฟอร์แมต KB เข้ากันได้** — corpus เขาเป็น markdown + frontmatter เสียบ build index
   ได้เลย (440 docs แปลงสำเร็จ ไม่ต้องแก้ฟอร์แมต)

## Finding (จุดที่ควรปรับ — ซื่อสัตย์)

**2 miss@1 ตอนรวม curriculum** ("ลาพักการศึกษา", "ทุน ป.เอก") โดน entry หมวด
`curriculum` (378 ตัว, ชื่อหลักสูตรซ้ำ ๆ) แย่งอันดับ 1. เมื่อตัด curriculum ออก
(เป็นโหมด program-lookup คนละแบบกับ FAQ fast-path) → recall@1 ขึ้นเป็น 82%.

**บทเรียน:** corpus ที่มี entry ประเภทเดียวซ้ำจำนวนมาก (program catalogue) ควรแยก
index/namespace จาก FAQ fast-path — ไม่ให้ dilute การจัดอันดับ. นี่คือสิ่งที่
spec `distributable-kernel` (federated corpus) รองรับอยู่แล้ว: แต่ละหมวด/หน่วยงาน
มี corpus แยก.

## ⚠️ กฎการใช้ (ย้ำ)

- corpus นี้เป็นงานของทีม GradMahidol (repo private) — **ใช้วัด benchmark ฝั่งเราเท่านั้น**
  ไม่ commit corpus เข้า repo เรา, ไม่ publish, ไม่เอาไปเป็น KB production
- ไฟล์ corpus เก็บใน `$KIROCREW_SCRATCH` (ไม่เข้า git) — เฉพาะ harness + ผลลัพธ์นี้ที่ commit
- `approval_status: pending_owner_approval` — ยังไม่ได้รับรองจากเจ้าของหน่วยงาน
- เจ้าของ (Ozone) แจ้งว่าจะเคลียร์เรื่องสิทธิ์ใช้ corpus กับน็อตเอง
