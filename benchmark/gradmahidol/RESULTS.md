# Benchmark Results — ReflexWork search × GradMahidol corpus

> **วันที่วัด:** 31 ตุลาคม 2569
> **Corpus:** knowledge markdown ของทีม GradMahidol AI (ประกาศทางการ, ไม่มี PII —
> provenance + กฎอนุญาต/PDPA ดู `docs/pitching/70-field-evidence-gradmahidol.md`)
> **โค้ดที่วัด:** `_jsSearch` ของ production (สกัดจาก `submissions/ui/chatbot.html`) —
> อัลกอริทึมเดียวกับที่ deploy จริง ไม่ใช่สำเนา
> **คำสั่ง:** `CORPUS=<path>/knowledge [EXCLUDE_CURRICULUM=1] node benchmark/gradmahidol/run_benchmark.mjs`

## สรุปผล (วัดจริง ไม่ใช่ projection)

ชุดทดสอบ: **31 คำถามจริง** 4 หมวด (thesis/registration/admissions/student_affairs)
จาก log ทดสอบ LINE/แชตของทีม GradMahidol เอง + typo 3 ข้อ + **off-corpus junk 5 ข้อ**
(อากาศ, ร้านกาแฟ, หุ้น, หนัง, "เบอร์ส่วนตัวคณบดี") ที่ต้อง abstain.

| ชุด | KB entries | recall@1 | recall@3 | abstain |
|---|---|---|---|---|
| ทั้ง corpus (ไม่แยก namespace) | 440 | 81% (25/31) | 94% (29/31) | 5/5 ✓ |
| **ทั้ง corpus + แยก namespace** | 440 | **87% (27/31)** | **97% (30/31)** | 5/5 ✓ |
| **เฉพาะ FAQ (ไม่รวม curriculum)** | 62 | **94% (29/31)** | **100% (31/31)** | 5/5 ✓ |

> `NAMESPACE=1` จำลอง design ของ `distributable-kernel`: curriculum (program
> catalogue 378 ตัว) เป็น namespace แยก → FAQ query ไม่แข่งกับ template หลักสูตร.
> **ผล: recall@1 ขึ้นจาก 81% → 87% บน corpus เต็ม** = พิสูจน์ว่าการแยก namespace
> แก้ปัญหา dilution ได้จริง (ไม่ใช่แค่ทฤษฎี).

## สิ่งที่พิสูจน์ได้

1. **search ของ ReflexWork generalize ข้าม corpus อิสระได้** — recall@1 94% / @3 100%
   (FAQ) บน corpus ที่ *ไม่เคยเห็นมาก่อน* ≥ 82%/96% บน KB เราเอง → ไม่ใช่ overfit
2. **abstain ทำงานถูก 5/5** — off-corpus ได้ blended score s=1.0 ต่ำกว่า gate → ไม่มั่ว
   แม้แต่ "เบอร์ส่วนตัวคณบดี" ก็ abstain (ตรงกับ hard-rule "abstain over guess")
3. **ฟอร์แมต KB เข้ากันได้** — corpus เขาเป็น markdown + frontmatter เสียบ build index
   ได้เลย (440 docs แปลงสำเร็จ ไม่ต้องแก้ฟอร์แมต)
4. **การแยก namespace ให้ผลวัดได้จริง** — ดัน recall@1 81% → 87% บน corpus เต็ม

## Finding (จุดที่ควรปรับ — ซื่อสัตย์)

ตอนรวม curriculum เข้า index เดียว คำถาม FAQ บางข้อ ("ลาพัก", "ทุน ป.เอก",
"ลายเซ็นหน้าลงนาม", "ค่าเล่าเรียน") โดน entry หมวด `curriculum` (378 ตัว, ชื่อ
หลักสูตรซ้ำ ๆ norm สูง) แย่งอันดับ 1 → recall@1 = 81%.

**แก้ด้วย namespace (วัดแล้ว):** แยก curriculum เป็น namespace ต่างหาก → FAQ query
ไม่แข่งกับ program template → **recall@1 ขึ้น 81% → 87%** (corpus เต็ม); บน FAQ ล้วน
= 94%/100%. นี่คือสิ่งที่ spec `distributable-kernel` (federated corpus) รองรับอยู่แล้ว:
แต่ละหน่วยงาน/หมวดมี corpus แยก index แยก — การวัดนี้ยืนยันว่า design นั้นแก้ dilution
ได้จริง ไม่ใช่แค่ทฤษฎี.

**รันโหมดต่าง ๆ:**
```
CORPUS=<path>/knowledge node run_benchmark.mjs                      # full, flat index
CORPUS=<path>/knowledge NAMESPACE=1 node run_benchmark.mjs          # full, curriculum = namespace แยก
CORPUS=<path>/knowledge EXCLUDE_CURRICULUM=1 node run_benchmark.mjs # FAQ-only (62 docs)
```

## ⚠️ กฎการใช้ (ย้ำ)

- corpus นี้เป็นงานของทีม GradMahidol (repo private) — **ใช้วัด benchmark ฝั่งเราเท่านั้น**
  ไม่ commit corpus เข้า repo เรา, ไม่ publish, ไม่เอาไปเป็น KB production
- ไฟล์ corpus เก็บใน `$KIROCREW_SCRATCH` (ไม่เข้า git) — เฉพาะ harness + ผลลัพธ์นี้ที่ commit
- `approval_status: pending_owner_approval` — ยังไม่ได้รับรองจากเจ้าของหน่วยงาน
- เจ้าของ (Ozone) แจ้งว่าจะเคลียร์เรื่องสิทธิ์ใช้ corpus กับน็อตเอง
