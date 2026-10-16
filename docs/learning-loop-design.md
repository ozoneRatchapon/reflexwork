# ReflexWork — Learning Loop (design สุดท้าย)

> ระบบ "รู้ว่าตัวเองขาดอะไร" และปิดช่องเอง โดยมีคนอยู่แค่จุดอนุมัติเดียว
> ตอบ verdict ตั้งต้น: "corpus ไม่ครอบคลุม → chatbot ตอบไม่ตรง → คนเลิกใช้"

## แผนภาพรวม

```
                    ┌─────────────── ผู้ใช้ถามเข้ามา ───────────────┐
                    ▼                                               │
          🦀 Reflex Kernel (gate σ · confidence · abstain · BLAKE3)  │
       ┌────────────┼───────────────┬──────────────────┐            │
       ▼            ▼               ▼                  ▼            │
   factual      advice+KB      advice ไม่ตรง        personal        │
   FastPath     Grounded       (abstain)           Intake          │
   0 token      Hybrid         → staff             → staff          │
       │            │               │                  │            │
       └── 👍/👎 ────┴───────┐       │ gap log          │ gap log     │
                            ▼       ▼                  ▼            │
                   ② entry_conf   ① gap_log (PII-safe, counts-first)│
                   (EMA ต่อ entry)  (คำถามที่ตอบไม่ได้ จัดอันดับถามบ่อย)│
                            │       │                               │
                            │       ▼                               │
                            │   ③ auto-draft (AI ร่างจาก gap)        │
                            │   + staff #kb / dashboard draft        │
                            │       │                               │
                            ▼       ▼                               │
                       [ สิ่งที่ต้องทำกับ corpus — ระบบจัดให้ ]        │
                            │                                       │
                            ▼                                       │
                   staff กด "อนุมัติ" (จุดเดียวที่เหลือให้คน)          │
                            │                                       │
                            ▼                                       │
                   KB entry ใหม่ → rebuild ──────────────────────────┘
                   (ครั้งหน้าตอบได้)
```

## 3 สัญญาณ learning (อัตโนมัติทั้งหมด)

| # | สัญญาณ | เก็บที่ไหน | บอกอะไร | อัตโนมัติ? |
|---|---|---|---|---|
| ① | **Gap** | `gap_log` (D1) | คำถามที่ตอบไม่ได้ จัดอันดับถามบ่อย (PII masked) | ✅ |
| ② | **Confidence** | `entry_conf` (D1) | KB ข้อไหนถูก 👎 บ่อย = ข้อที่ต้องแก้ (EMA) | ✅ |
| ③ | **Auto-draft** | `kb_draft` (D1) | AI ร่างคำตอบจาก gap ยอดฮิต + staff #kb | ✅ |

ทั้ง 3 โผล่ในแดชบอร์ด staff เป็นการ์ด → staff เห็นภาพรวมว่าควรทำอะไรต่อ

## จุดที่เหลือให้คน (โดยเจตนา)
**กด "อนุมัติ" 1 คลิก** — ไม่ publish KB ที่ไม่ได้ตรวจ เพราะงานราชการตอบผิดไม่ได้
(auto-approve = ความเสี่ยงที่ไม่คุ้ม สำหรับ PDPA/วิทยานิพนธ์จริง)

## การขับเคลื่อน (triggers)
- **ผู้ใช้ 👍/👎** → entry_conf ปรับเอง (web chatbot ส่ง `entry_id`)
- **ตอบไม่ได้** → gap_log เก็บเอง (web + LINE)
- **staff พิมพ์ `#kb คำถาม | คำตอบ`** ใน LINE → draft ทันที
- **ปุ่ม dashboard "Auto-draft"** → AI ร่างจาก gap ยอดฮิต
- **Cloudflare Cron** (02:00 UTC รายวัน) → auto-draft อัตโนมัติ ไม่ต้องกดปุ่ม

## endpoints
| path | ใคร | ทำอะไร |
|---|---|---|
| `POST /gap` | web/LINE | log คำถามที่ตอบไม่ได้ |
| `GET /gaps` | dashboard | backlog ถามบ่อยสุด |
| `POST /feedback {entry_id,reward}` | web | ปรับ entry_conf |
| `GET /entry-conf` | dashboard | entry อ่อนสุดก่อน |
| `POST /kb-draft` | staff/LINE | บันทึก candidate (pending) |
| `GET /kb-drafts` | dashboard | รออนุมัติ |
| `POST /kb-approve {id}` | staff | อนุมัติ → emit KB markdown |
| `POST /kb-autodraft {limit}` | dashboard/cron | AI ร่างจาก gap → pending |

staff endpoints guard ด้วย `STAFF_TOKEN` (optional; zero-config สำหรับ demo)

## ขอบเขต (พูดตรง)
- **ยังไม่ auto-approve** — คนต้องตรวจ (ถูกต้องสำหรับ domain นี้)
- **ยังไม่ retrain model** — เป็น KB-driven (เพิ่ม entry) ไม่ใช่ fine-tune → ถูกกับ "ไม่ใช้ AI/0 token"
- **cron รายวัน** bounded 3 drafts/run กัน LLM cost
- auto-draft คุณภาพขึ้นกับ local model — ร่างเป็นจุดตั้งต้น staff แก้ก่อน approve ได้
