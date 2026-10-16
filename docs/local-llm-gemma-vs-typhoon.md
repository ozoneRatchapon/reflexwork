# Local LLM สำหรับ LLM-path ของ ReflexWork — Gemma vs Typhoon

> บริบท: ReflexWork คัดคำถาม ~80% ออกด้วย kernel (FastPath 0 token) เหลือ
> ~20% ที่ต้อง LLM เท่านั้น การใช้ **local model** สำหรับส่วนนี้ = ตัดค่า token
> เป็น 0 + ข้อมูลไม่ออกจากเครื่อง (PDPA) ต่อผ่าน `integrations/_shared/team-adapter.mjs`
> provider `ollama` ที่เพิ่งเพิ่ม

## สรุปสั้น (TL;DR)

**เลือก Typhoon 2.1 (Gemma3-based) ไม่ใช่ Gemma base** — เพราะคำถามของเราเป็น
**ภาษาไทยงานราชการ/บัณฑิตศึกษา** ซึ่งเป็นจุดที่ model ทั่วไปอ่อน และเป็นจุดที่
Typhoon ถูก fine-tune มาโดยเฉพาะ ข้อสำคัญ: **Typhoon สร้างบน Gemma อยู่แล้ว**
(scb10x/typhoon2.1-gemma3-*) จึงได้สถาปัตยกรรม Gemma + ภาษาไทยที่ดีกว่า โดยไม่ต้องเลือกอย่างใดอย่างหนึ่ง

## ตารางเทียบ

| หัวข้อ | Gemma (base) | Typhoon 2.1 (Thai-tuned) |
|---|---|---|
| ผู้สร้าง | Google | SCB10X (ไทย) |
| ฐาน | — | **สร้างบน Gemma 3** |
| ภาษาไทย | พอใช้ แต่สำนวนราชการ/บริบทไทยคลาดได้ | **ดีกว่าชัดเจน** — fine-tune บน corpus ไทย, benchmark ไทยนำ open-model อื่น |
| tokenizer ไทย | มาตรฐาน | มีงานวิจัยว่า Typhoon รุ่นก่อน tokenize ไทยคุ้มกว่า ~2.6x (คุ้ม token/latency) |
| ขนาดที่มีบน Ollama | `gemma2:2b` / `9b`, `gemma3:*` | `typhoon2.1-gemma3-4b` / `12b`, `llama3.2-typhoon2-1b/3b` |
| เหมาะกับ | demo เร็ว / งานที่ไม่เน้นไทยลึก | **production ไทยจริง (เคสเรา)** |
| ค่าใช้จ่าย | 0/token (local) | 0/token (local) |

## คำแนะนำตามสเปกเครื่อง

| เครื่อง | เลือก | เหตุผล |
|---|---|---|
| laptop demo (RAM จำกัด) | `scb10x/llama3.2-typhoon2-3b-instruct` | เบา รันไหว ไทยโอเคกว่า Gemma 2B |
| เครื่อง dev มี GPU/RAM พอ | `scb10x/typhoon2.1-gemma3-4b` | สมดุล ไทยดี ฐาน Gemma3 |
| server มหาวิทยาลัย | `scb10x/typhoon2.1-gemma3-12b` | ไทยคุณภาพสูงสุดใน options นี้ |
| แค่พิสูจน์ pipeline (ไม่เน้นคุณภาพ) | `gemma2:9b` | มีอยู่แพร่หลาย ติดตั้งง่าย |

## ข้อควรรู้ (พูดตรง ๆ)

1. **ยังไม่ได้วัดคุณภาพจริงกับคำถามบัณฑิตศึกษาของเรา** — ตารางนี้อิง benchmark
   ทั่วไป + เอกสาร SCB10X ก่อน production จริงต้องเอาคำถามจริง (จาก gap log /
   แชต LINE ที่สรุปไว้) มา A/B เทียบ Gemini กับ Typhoon เอง
2. **local = ต้องมีเครื่องรันตลอด** — Ollama ต้องเปิดค้างบน host ที่ adapter เข้าถึงได้
   (ดูข้อจำกัด Cloudflare ด้านล่าง)
3. **คุณภาพ local < Gemini cloud โดยทั่วไป** — trade-off คือ "ฟรี + ไม่ส่งข้อมูลออก"
   แลกกับความแม่นที่ลดลงบ้าง เหมาะเมื่อ privacy/cost สำคัญกว่าความเพอร์เฟกต์
4. ทางสายกลางที่คุ้ม: **local เป็น default, cloud เป็น fallback** — ถ้า local ไม่มั่นใจ
   (หรือคำถามยากเกิน) ค่อย fail ขึ้น Gemini เฉพาะเคส

## ⚠️ Cloudflare Worker เรียก localhost/Ollama ไม่ได้ (ข้อจำกัดสำคัญ)

Worker รันบน edge ของ Cloudflare จึง **ไม่มีเส้นทางไปถึง `127.0.0.1` หรือ LAN
ของเครื่องคุณ** ดังนั้น provider `ollama` ใช้ได้เฉพาะเมื่อ `askTeam` รันที่ที่เห็น
Ollama ได้ (เลือก 1 ใน 3):

1. **Node adapter** (`integrations/line/adapter.mjs`) รันบนเครื่อง/LAN เดียวกับ Ollama — ง่ายสุดสำหรับ demo
2. **relay ของเราเอง** (เซิร์ฟเวอร์เล็ก ๆ) ที่ Worker forward ไปหา
3. เปิด Ollama ผ่าน **public/tunnel HTTPS** (เช่น Cloudflare Tunnel) แล้ว Worker ค่อยเรียก

รายละเอียดใน `integrations/line/README.md` หัวข้อ "Point the LLM path at a LOCAL model"
