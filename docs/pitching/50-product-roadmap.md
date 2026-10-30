# Product Roadmap — ต่อยอด production + scale ทั้งมหาวิทยาลัย

> ตอบคำถามเจ้าของโดยตรง: "demo ควรไปทาง production-ready หรือ adapt ทั้ง ม.
> เพื่อโชว์ impact? พัฒนาระบบต่อยังไง?"
>
> **คำแนะนำสั้น (TL;DR):** สำหรับ **5 นาที pitch** → โฟกัส **Impact + Readiness**
> ที่ *มีอยู่แล้ว* (live production + federated design) ไม่ต้องสร้างของใหม่.
> สำหรับ **หลัง pitch (ถ้าได้ไปต่อ/นำร่อง)** → เดินตาม roadmap ด้านล่าง.

---

## เลือกโฟกัส demo รอบ pitch (ตัดสินใจ)

เจ้าของถาม 2 ทาง — นี่คือการวิเคราะห์:

### ทาง A — Production-readiness (ลึกจุดเดียว)
โชว์ว่า ReflexWork **พร้อมใช้จริงกับบัณฑิตวิทยาลัยวันนี้**: load test, uptime,
staff workflow เต็ม, PDPA sign-off.
- **ข้อดี:** ตอบเกณฑ์ Implementation Readiness (20) ตรง ๆ, น่าเชื่อสำหรับสายอุตสาหกรรม
- **ข้อเสีย:** impact ดู "แค่หน่วยเดียว" — ไม่ wow เรื่อง scale

### ทาง B — Scale-wide (กว้างทั้งมหาวิทยาลัย)
โชว์ federated corpus: หลายคณะใช้ร่วมกัน, impact ระดับมหาวิทยาลัย.
- **ข้อดี:** ตอบเกณฑ์ Impact (25) แรงสุด, วิสัยทัศน์ใหญ่, แตกต่าง
- **ข้อเสีย:** ถ้าโชว์แต่วิสัยทัศน์ที่ยังไม่ทำ = เสี่ยงโดนจับ "ยัง demo ไม่ได้จริง"

### ✅ คำแนะนำ: **ทำทั้งคู่แบบ "พร้อมวันนี้ + ขยายได้พรุ่งนี้"**
เกณฑ์รอบนี้ Impact (25) + Readiness (20) **มาคู่กัน** — เล่าให้ต่อเนื่อง:
1. **"พร้อมวันนี้"** (Readiness) — demo สดบัณฑิตวิทยาลัยที่ live จริง + hardening ที่ทำแล้ว
2. **"ขยายได้"** (Impact/Scale) — federated corpus **ที่ออกแบบครบแล้วใน Kiro spec**
   (ไม่ใช่แค่พูดลอย — มี requirements/design/tasks ให้ตรวจ)

> **key move:** อย่าสร้างฟีเจอร์ scale ใหม่ก่อน pitch (เสี่ยง+เสียเวลา). ใช้ spec
> `distributable-kernel` ที่ **เขียนครบแล้ว** เป็นหลักฐานว่า "ออกแบบ scale ไว้แล้ว
> อย่างจริงจัง" — น่าเชื่อกว่าสร้าง prototype ครึ่ง ๆ กลาง ๆ ที่อาจพังตอน demo.

---

## Roadmap พัฒนาต่อ (หลัง pitch / ถ้าได้นำร่อง)

### Phase 1 — Pilot-ready (1 คณะจริง) · ~2-4 สัปดาห์
เป้า: บัณฑิตวิทยาลัยใช้จริงกับผู้ใช้จริง.
- [ ] เติมคู่มือจาก **ข้อมูล FAQ จริง** (ตอนนี้ KB ~70 หัวข้อ public) — ดู gap log
- [ ] **Load test** kernel + llm-proxy ภายใต้ concurrency (จุดที่ runbook บอกว่ายังขาด)
- [ ] Rate limiting ด้วย KV/Durable Object counter (ไม่ใช่ best-effort per-isolate)
- [ ] **PDPA review** ของ gap_log retention window (เป็นทางการ)
- [ ] Staff dashboard auth UI ให้สมบูรณ์ (ตอนนี้มี token-based แล้ว)
- [ ] D1 backup schedule อัตโนมัติ (cron/CI ก่อนทุก migration)

### Phase 2 — Multi-faculty (federated) · ~1-2 เดือน
เป้า: 2-3 คณะใช้ร่วมกัน (ตาม spec `distributable-kernel` R1-R6).
- [ ] publish kernel เป็น package: `@reflexwork/kernel` (WASM+types) + Rust crate (R1)
- [ ] `reflexwork init <name>` scaffolder — คณะใหม่ตั้งบอทของตัวเองใน 1 คำสั่ง (R2)
- [ ] opt-in masked telemetry + "dry-run what-would-be-sent" (R3)
- [ ] central corpus service: cluster gaps → auto-draft → human approve → signed release (R4)
- [ ] install pull corpus updates แบบ review ก่อน ไม่ทับของ local (R5)
- [ ] sign/verify corpus releases (R6)
> โค้ดเริ่มต้นมีแล้ว: `integrations/corpus-service/worker.mjs` + `_shared/federation.mjs`

### Phase 3 — University-wide service · ~3-6 เดือน
เป้า: service กลางที่ทุกหน่วยเรียกใช้.
- [ ] onboarding หน่วยงานใหม่ (ทะเบียน/การเงิน/IT/หอพัก)
- [ ] central dashboard: root-cause ข้ามหน่วย ("ระบบต้นทางไหนก่อคำถามเยอะสุด")
- [ ] SLA + monitoring + on-call runbook
- [ ] integration กับ SSO/ระบบมหาวิทยาลัย (ถ้าจำเป็น — ระวัง PDPA)

---

## สิ่งที่มีอยู่แล้ว (ใช้เป็นหลักฐาน Readiness/Scale ได้ทันที)

| หลักฐาน | ที่อยู่ | ใช้ตอบเกณฑ์ |
|---|---|---|
| live production | reflexwork.pages.dev (6 หน้า) | Readiness |
| WASM in-browser (ข้อมูลไม่ออกเครื่อง) | `crates/reflex-wasm/` → `submissions/ui/wasm/` | Readiness + PDPA |
| production hardening | `docs/production-hardening-runbook.md` | Readiness |
| federated corpus design ครบ | `.kiro/specs/distributable-kernel/` | Impact/Scale |
| corpus service โค้ดเริ่มต้น | `integrations/corpus-service/worker.mjs` | Scale |
| learning loop (gap→draft→approve) | `docs/learning-loop-design.md` + live dashboard | Impact |
| 11 unit tests + CI | `tests/` + `.github/workflows/` | Readiness |

> **อย่าเพิ่งสร้างของใหม่ก่อน pitch.** ของที่ *มีแล้ว* ข้างบนตอบเกณฑ์ได้ครบ.
> งานก่อน 7 พ.ย. = เด็ค pitch + ซ้อม + demo runbook (ไม่ใช่ coding ฟีเจอร์ใหม่).

---

## ถ้ามีเวลาเหลือก่อน pitch (nice-to-have, เรียงคุ้มค่า)

1. **เด็ค `/pitch.html` + QR live demo** — คุ้มสุด (ใช้ในพิตช์โดยตรง)
2. **ตัวเลข impact ที่จับต้องได้** — ถ้าพอมีข้อมูลคำถามจริง คำนวณ "ถ้า X คำถาม/วัน
   ที่ fast-path 80% = ประหยัด Y token/เดือน" (เป็นกรอบ ไม่ใช่เคลม)
3. **1-page leave-behind** — สรุป 1 หน้าแจกกรรมการ (reuse `submissions/one-pager.html`)
4. อัดวิดีโอ demo ใหม่ถ้า UI เปลี่ยนเยอะ (ตอนนี้ 46s ตัวล่าสุดครอบคลุมแล้ว)
