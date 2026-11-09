# Out-of-scope review — per case (2026-11-07)

**Verdict** (added 2026-11-09, plan 010 item 6, from this file's own numbers; no gates were preregistered for this run): of the 26 staff-only FAQ questions the page answers (Thai 14/30, English 12/30), 7 are plain wrong-topic matches and 19 are on topic or close. No scoring change was made; both follow-ups wait on the owner.

Source: the 30 staff-only FAQ items of the official Graduate School FAQ (`benchmark/field/faq_questions.json`), Thai and English wording.
Method: the same extraction and `decideTier` as `official_faq_eval.mjs` (gate 0.061), one question at a time, listing only the cases where the page would answer (`act`). Read-only; no scoring or KB change. Harness: a throwaway script outside the repo.

Result: Thai 14/30 answered, English 12/30 answered (matches `002_2026-11-05.md`).

## Thai (14)

| FAQ | Question (short) | KB entry it answers with | Topic |
|---|---|---|---|
| 3 | แบบฟอร์มงบประมาณดาวน์โหลดที่ไหน | internet_account | budget form (wrong topic) |
| 12, 13 | อบรมออนไลน์ประธาน/อาจารย์หลักสูตร, ตรวจประวัติการอบรม | gm_application_overview | staff training (wrong topic) |
| 43, 44 | การจัดซื้อจัดจ้างกี่วิธี / จากต่างประเทศ | purchase_methods | procurement (on topic, staff-only) |
| 51 | ใบเสร็จไม่มีจำนวนเงินตัวอักษร | receipt_incomplete | receipt (on topic, staff-only) |
| 53 | คณะกรรมการตรวจรับพัสดุกี่ท่าน | inspect_committee | procurement (on topic, staff-only) |
| 92, 94 | ค่าธรรมเนียมโอนเงินต่างธนาคาร/ต่างประเทศ | transfer_fee | finance (on topic, staff-only) |
| 93 | เบิกค่าตอบแทนวิทยากร/กรรมการ | thesis_committee_pay | finance (close, staff-only) |
| 95 | เบิกจ่ายล่าช้าเกิน 30 วัน | late_reimburse | finance (on topic, staff-only) |
| 97 | หลักฐานการเบิกจ่ายลงนามผู้ | gm_registration_proof | finance (wrong topic) |
| 98 | ชาวต่างชาติไม่มีบัญชีธนาคาร | research_no_bank | finance (close, staff-only) |
| 99 | จ่ายค่าตอบแทนวิทยากรโครงการ | thesis_committee_pay | finance (close, staff-only) |

## English (12)

| FAQ | Question (short) | KB entry it answers with | Topic |
|---|---|---|---|
| 1 | budget proposal deadline | scholarship_types | wrong topic |
| 3 | budget form download | thesis_forms_where | wrong topic |
| 43, 49 | procurement methods / approval communication | purchase_methods | procurement |
| 51 | receipt without amount in words | receipt_incomplete | receipt |
| 53, 90 | procurement inspection committee size / instructor remuneration | inspect_committee | procurement (90 wrong topic) |
| 92, 94 | interbank / international transfer fees | transfer_fee | finance |
| 93 | remuneration request | thesis_committee_pay | finance |
| 95 | reimbursement over 30 days | late_reimburse | finance |
| 98 | foreign payee without Thai bank account | research_no_bank | finance |

## What this shows

- 7 of the 26 answered cases are plain wrong-topic matches (Thai FAQ 3, 12, 13, 97; English FAQ 1, 3, 90). Those are the ones the page should hand off.
- The other 19 are on-topic or close (English FAQ 49 is borderline): the KB has an entry for the same subject, but the school marks the FAQ item as staff-only. Answering them may be correct; the "out of scope" label is the school's, and the owner decides whether these questions belong to the student bot.
- Fixing the wrong-topic ones means a scoring or gate change (`_cosToScore` / `decideTier`). Per the plan's stop rule, that needs the owner's decision first, so no code was changed.

## Owner decision needed

1. Should the bot answer staff-only topics (procurement, transfer fees, reimbursement) when the KB has an entry, or hand them to staff? The 17 on-topic cases depend on this.
2. For the 9 wrong-topic cases, approve a scoring/gate change, then re-run `benchmark/field/official_faq_eval.mjs` and the recall eval (must stay at 39/50 or better).
