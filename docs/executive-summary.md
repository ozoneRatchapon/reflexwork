# 🦀 ReflexWork — Executive Summary

**ชั้นคัดกรองหน้า LLM สำหรับ chatbot บัณฑิตศึกษา มหาวิทยาลัยมหิดล**
วันที่ 16 ตุลาคม 2569

---

## คืออะไร
Reflex Kernel (Rust/WASM · sigmoid gate + BLAKE3 proof) ตัดสินทุกคำถามใน
**ไมโครวินาที** ว่าตอบเองได้ (FastPath 0 token) หรือต้องส่งต่อ — ไม่ใช่ chatbot
ที่แข่งกับใคร แต่เป็น **ตัวกรองที่ทำให้ระบบเดิมถูกลง ~80% และตรวจสอบได้ 100%**

แนวคิดเดียวกับ "System One" models (TypeSafe Jev, reflex.gist.rs): ตัดสินใจเร็ว
มีโครงสร้าง **แต่งข้อเท็จจริงไม่ได้** — ข้อเท็จจริงมาจาก KB, model แค่เรียบเรียง

## ปัญหาที่แก้ (3 ข้อที่ผู้บริหารกังวล)
| ข้อกังวล | คำตอบ |
|---|---|
| "keyword ทื่อ อยากได้ภาษาคน" | template NLG + grounded hybrid — ภาษาคน **ไม่ใช้ AI** (deterministic, ตรวจสอบได้) |
| "token แพง ไม่มั่นใจค่าใช้จ่าย" | คัด 80% ก่อนถึง LLM + local Typhoon (0 token, ข้อมูลไม่ออกนอกเครื่อง) |
| "corpus ไม่ดี → คนเลิกใช้" | learning loop ที่โตเองจากงานจริง (ไม่ retrain model) |

## การตัดสินใจ 4 ทาง (หัวใจของระบบ)
1. **factual** ("กี่วัน/กี่บาท") → FastPath จาก KB · 0 token · ตัวเลขเป๊ะ
2. **advice** ("แนะนำวิธี...") → grounded hybrid (KB ground + AI เรียบเรียง) · ลื่น + ไม่มั่ว
3. **off-corpus / ไม่มั่นใจ** → abstain · ส่ง staff + log gap (ไม่เดา)
4. **personal** ("login ไม่ได้") → intake เก็บ ชื่อ/ID/ระบบ/อาการ ก่อนส่ง staff

## Learning loop (ยิ่งใช้ยิ่งฉลาด · ไม่ retrain)
```
ตอบไม่ได้ → gap log (PII-masked, จัดอันดับถามบ่อย)
👎        → confidence ของ KB entry ลดเอง (รู้ว่าข้อไหนแย่)
auto-draft → AI ร่างคำตอบจาก gap (cron รายวัน)
          → staff กด approve 1 คลิก → KB ใหม่ → ครั้งหน้าตอบได้
root-cause → dashboard บอก "ระบบต้นทางไหนก่อปัญหาเยอะสุด" → แก้ที่ต้นเหตุ
```

## สถานะความพร้อม
- 🦀 engine 4-way + NLG + rethink layer
- 🔁 learning loop (gap + confidence + auto-draft + cron รายวัน)
- 💰 local AI (Typhoon 3b, 0 token) ↔ Pages ผ่าน ngrok + health-check
- 🎤 voice (Web Speech API + hook local Whisper/Thai-TTS)
- 🎯 **Kiro AI-SDLC**: specs ×2 (requirements→design→tasks) + steering + hooks + CI
- 📦 open-source: README + LICENSE + 15 unit tests
- 🔒 production hardening: staff auth (live) + D1 backup + OLLAMA_TOKEN

## วิสัยทัศน์ (หมัดเด็ด)
ReflexWork วัดความสำเร็จจากการที่ **คำถามลดลง** (เพราะระบบต้นทางถูกแก้) ไม่ใช่
จากการมีคนใช้เยอะ — ทุกคำถามที่ตอบไม่ได้คือสัญญาณบอก IT ว่าต้องแก้ตรงไหน
**เป้าหมายสูงสุดคือ "ทำให้ตัวเองไม่จำเป็น"**

---

**Live:** reflexwork.pages.dev/chatbot.html · /dashboard.html · /slides.html (16 หน้า)
**วันนี้:** 27 PRs merged
**เหลือ:** เติม corpus จากข้อมูลจริง · production (dashboard auth UI, load test, D1 backup schedule)

ทีม: Ratchapon (Ozone) · Napatsakorn — Built with Kiro + Amazon Bedrock
