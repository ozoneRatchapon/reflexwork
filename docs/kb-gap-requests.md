# Knowledge-base gap requests for the Graduate School KB owners

Found 2026-11-03 by asking 35 beginner questions on the chatbot (local copy of `main`, deterministic path). The chatbot only answers
from approved text, so these need **approved entries or approved wording** from the KB owners. Nothing here was invented or guessed.
Re-run after each update: a question list and a how-to are at the bottom.

## A. Not understood at all (the page says "I do not understand")
| Question people type | Why it matters |
|---|---|
| รักษาสถานภาพนักศึกษาคืออะไร | basic status term |
| ขอใบรับรองนักศึกษา | very common request |
| เวลาทำการวันไหนบ้าง | office hours (contact entry exists, hours wording not matched) |
| ต้องมีผลงานตีพิมพ์ไหม | graduation requirement |
| GPA ขั้นต่ำเท่าไหร่ | admission / continuation |
| มีหอพักไหม | student life |
| ปริญญาเอกเรียนกี่ปี (generic answer only) | programme duration |

## B. Answered, but the entry shown is not what was asked (please check the wording)
| Question | What the page showed |
|---|---|
| คะแนน TOEFL ขั้นต่ำเท่าไหร่ | how to pick up a score result |
| จบการศึกษาต้องทำอะไรบ้าง | the RA-04 leave form |
| เปลี่ยนอาจารย์ที่ปรึกษา | progress-evaluation text |
| ขอผ่อนผันค่าเทอม | a "which one do you mean" list of registrar forms |

## C. Fixed on 2026-11-03 without new facts (extra search wording only)
"ส่งวิทยานิพนธ์เมื่อไหร่" and "วิธีใช้ e-Thesis" now reach the existing deadline / e-Thesis entries (one keyword added to each; recall floors unchanged).

## How to check after an update
1. `python3 submissions/build_knowledge_index.py` (approved entries only)
2. `node tests/kb_search.test.mjs` (recall floors) and `node benchmark/compare/decision_rule.mjs` (answered right / wrong / asked / handed on)
3. Ask the questions above on the page, or run the 35-question probe described in `.plans/001_kb-gradmahidol-faq-import.md`.
