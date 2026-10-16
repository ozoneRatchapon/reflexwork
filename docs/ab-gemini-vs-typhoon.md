# A/B: Gemini (cloud) vs Typhoon 3b (local) — คำถามจริง

> ทดสอบด้วยคำถามจาก pattern จริง (แชต LINE + gap log) เพื่อเลือก LLM-path backend
> วันที่: 16 ต.ค. 2569 · model local: `scb10x/llama3.2-typhoon2-3b-instruct`

## วิธีทดสอบ
ยิงคำถามเดียวกันเข้า 2 ทาง: Gemini (ผ่าน proxy เดิม) และ Typhoon 3b local (Ollama).
วัด latency + ประเมินคุณภาพภาษาไทย/ความถูกต้อง. ทุกคำถามเป็นประเภทที่ไป LLM-path จริง
(advice / ร่างข้อความ / ปัญหาเฉพาะคน).

## ผล (Typhoon 3b local)

| คำถาม | ประเภท | latency | ประเมิน |
|---|---|---|---|
| แนะนำวิธีวางแผนทำวิทยานิพนธ์ | advice | ~3.5s | ✅ ใช้ได้ — คำแนะนำทั่วไปสมเหตุผล ภาษาลื่น |
| อาจารย์เข้าระบบอนุมัติไม่ได้ | personal/technical | ~1.3s | ⚠️ generalize — บอกให้ติดต่อ "TA/สาขา" ไม่รู้ว่าต้องกองไอที (ต้อง KB/staff) |
| ร่างอีเมลขอเลื่อนสอบ | generative | ~2.0s | ✅ ดี — ร่างอีเมลเป็นทางการใช้ได้เลย |

## ข้อสรุป

**Typhoon 3b local เหมาะกับ: advice + งาน generative (ร่างอีเมล/เรียบเรียง)**
- ภาษาไทยลื่น เป็นทางการ ใช้ได้จริง
- latency 1–4s บน M5 (ยอมรับได้สำหรับ LLM-path ที่เป็นส่วนน้อย)
- 0 ค่า token, ข้อมูลไม่ออกจากเครื่อง

**Typhoon (และ AI ทุกตัว) ไม่เหมาะกับ: ข้อเท็จจริงเฉพาะ (เบอร์/ขั้นตอน/account)**
- มัน generalize/แต่งเอง (เทสก่อนหน้าแต่งเบอร์ cuhk.ac.th, เทสนี้บอก "TA" ที่ไม่มีจริง)
- → ยืนยันสถาปัตยกรรม: **ข้อเท็จจริงต้องมาจาก KB (FastPath/grounded) ไม่ใช่ generative**

## คำแนะนำ backend ตามกรณี

| กรณี | backend | เหตุผล |
|---|---|---|
| demo / dev / privacy สำคัญ | **Typhoon local** | ฟรี, 0 token, ไม่ส่งข้อมูลออก, คุณภาพ advice พอ |
| production ที่เน้นคุณภาพสูงสุด | Gemini (fallback) | ภาษา/เหตุผลดีกว่า แต่มีค่า token + ข้อมูลขึ้น cloud |
| ข้อเท็จจริง (กี่วัน/เบอร์/ขั้นตอน) | **ไม่ใช้ LLM เลย** | FastPath/grounded จาก KB — Ag ทุกตัวแต่งได้ |

**สถาปัตยกรรมที่เลือก (มีแล้ว):** local เป็น default (proxy `OLLAMA_URL`), Gemini เป็น
fallback อัตโนมัติเมื่อ local ล่ม — ได้ทั้งประหยัด (ปกติ local 0 token) และคุณภาพ
(fallback cloud เมื่อจำเป็น). ส่วนข้อเท็จจริงไม่แตะ LLM ทั้งคู่.

## ข้อจำกัดของการทดสอบนี้
- gap log จริงยังน้อย (ใช้ pattern จากแชตแทน) — ควรทดสอบซ้ำเมื่อมี gap จริงสะสมมากขึ้น
- ยังไม่ได้ลอง typhoon2.1-gemma3-12b (ไทยดีกว่า แต่ติด template bug บน Ollama 0.32.13 — รอ upgrade)
- ไม่ได้วัด Gemini latency ตรง ๆ ในรอบนี้ (proxy ถูกตั้งให้ route local แล้ว)
