# ReflexWork — Security Report

เอกสารสรุปการตรวจสอบความปลอดภัยของ ReflexWork (Mahidol AI Community 2026)
Live: https://reflexwork.pages.dev · Scope: static pages + 3 Cloudflare Workers (kernel, llm-proxy, line) + D1

---

## สรุปผู้บริหาร

ReflexWork ผ่านการตรวจสอบความปลอดภัย 2 รอบ (live probe + source review) **ไม่พบช่องโหว่
ที่ exploit ได้จริง** การออกแบบวางความปลอดภัยไว้ตั้งแต่ต้น: ข้อมูลสาธารณะประมวลผลในเบราว์เซอร์
(ไม่มี PII), ความลับ (API key, LINE token) อยู่ใน Worker secret ไม่เคยถึง client, ทุก query
ฐานข้อมูลเป็น parameterized, และ CORS จำกัดเฉพาะ origin ของเว็บ

---

## หลักการออกแบบด้านความปลอดภัย

| หลักการ | การนำไปใช้ |
|---|---|
| **แยก public / personal** | public knowledge → เบราว์เซอร์ (WASM, ไม่มี PII); personal → ต้อง auth + DB (Tier 2) |
| **Secret ไม่ถึง client** | Gemini key, LINE token = Worker secret; static page ไม่มีความลับใด ๆ |
| **Least exposure** | kernel/LLM/LINE แต่ละตัวเปิดเฉพาะ route ที่จำเป็น; method guard ทุก endpoint |
| **Defense in depth** | CORS + rate-limit + input bounds + parameterized SQL + feedback dedup |
| **Auditability** | ทุก routing decision มี BLAKE3 proof ที่ reproduce ได้ (ตรวจย้อนหลัง, PDPA) |

---

## ผลการทดสอบ (2 รอบ)

| การทดสอบ | ผล | รายละเอียด |
|---|---|---|
| SQL injection (feedback/audit) | ✅ ปลอดภัย | ทุก query ใช้ `.bind()` parameterized; ไม่มี string-concatenated SQL |
| CORS จาก origin แปลกปลอม | ✅ ปลอดภัย | `Access-Control-Allow-Origin` = `reflexwork.pages.dev` เท่านั้น |
| ขโมย API key | ✅ ปลอดภัย | key เป็น Worker secret; ไม่มี route ที่คืนค่า key; `/models` = 405 |
| Oversized payload | ✅ แก้แล้ว | /route cap input 4000, category 64, priority 0–255 (10k input → 200, ไม่ crash) |
| Malformed / empty JSON | ✅ ปลอดภัย | คืน 400 ไม่ใช่ 500; ไม่ crash |
| Prototype pollution (`__proto__`) | ✅ ปลอดภัย | ไม่ไหลเข้า logic; route ปกติ |
| Type confusion (reward ไม่ใช่ตัวเลข) | ✅ ปลอดภัย | clamp เป็น 0; reward clamp [-1, 1] |
| Feedback poisoning / vote ซ้ำ | ✅ ปลอดภัย | dedup ด้วย BLAKE3 proof (1 answer = 1 vote); bounded EMA step |
| Method guard (GET/wrong method) | ✅ ปลอดภัย | GET /route → 404; wrong method → 405 |
| LINE signature ปลอม | ✅ (PoC) / ⚠ (prod) | HMAC-SHA256 verify; เตือนถ้า signature มาแต่ secret ยังไม่ตั้ง |
| Rate limiting | ✅ (basic) | token bucket per-IP (kernel cap 60, llm-proxy cap 20) |

---

## ข้อควรทำก่อน Production (hardening roadmap)

สิ่งเหล่านี้ **ไม่ใช่ช่องโหว่ของ demo** แต่เป็นสิ่งที่ต้องทำเมื่อเปิดใช้จริงกับนักศึกษา:

1. **ตั้ง `LINE_CHANNEL_SECRET`** — เปิดใช้ HMAC signature enforcement (ตอน demo ไม่ตั้งเพื่อให้ PoC รันได้)
2. **Rate-limit แบบ global** — ใช้ Durable Object หรือ KV แทน per-isolate bucket เพื่อกันการยิงถล่มจริง
3. **Auth สำหรับ personal data (Tier 2)** — SSO มหาวิทยาลัย + row-level isolation + encrypt at rest ตาม PDPA
4. **Feedback แบบ staff-weighted** — ให้ 👎 ของเจ้าหน้าที่ที่ login มีน้ำหนักกว่า anonymous
5. **Monitoring / alerting** — log อัตราผิดพลาด, cost ของ LLM path, การ dedup ที่ผิดปกติ

---

## ขอบเขตข้อมูล (data governance)

- **Public FAQ (67 ข้อ):** ของเราเอง เรียบเรียงจาก FAQ ทางการของบัณฑิตวิทยาลัย อ้างแหล่งทุกข้อ
  (`approval_status: approved`) — publishable
- **ข้อมูลทีมอื่น (18 ไฟล์, pending):** gitignored + build gate กรองออก + ไม่เคย deploy —
  ไม่มีการเผยแพร่โดยไม่ได้รับอนุมัติ
- **ไม่มี PII ในชั้น public** — personal data เป็น Tier 2 ที่ต้อง auth (ยังไม่เปิด)
