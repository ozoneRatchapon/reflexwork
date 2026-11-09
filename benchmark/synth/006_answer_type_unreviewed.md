# Answer-type match signal (lexical, no model)

**Verdict** (added 2026-11-09, plan 010 item 6, from this file's own numbers; no gates were preregistered for this run): the answer-type flag fires on 26.5% of near-misses vs 2.5% of Thai and 7.2% of English paraphrases: worth a note, too costly as a hard rule (shipped as a note, plan 010 item 2). Labels unreviewed.

Candidate entry = the question's source entry. "Flagged" = the question asks for a value type the entry text does not contain.

| set | n | asks a typed value | flagged (type missing in entry) | examples flagged |
|---|---|---|---|---|
| para_th | 528 | 17.6% | 2.5% (13) | ปี 2570 ต้องส่งเอกสารผ่อนผันทหารเมื่อไหร่ แล้ · นักศึกษาเก่า (ก่อนปี 67) ที่สอบผ่านแล้วแต่ยัง · จะเช็คค่าธรรมเนียมการศึกษาของหลักสูตรนานาชาติ |
| para_en | 264 | 21.6% | 7.2% (19) | How many working days does the abstract revie · How to check the dormitory vacancy and room f · Do I need to pay tuition fees if I passed my  |
| near_miss | 264 | 35.2% | 26.5% (70) | ค่าธรรมเนียมในการตรวจบทคัดย่อราคาเท่าไหร่ · ต้องใช้เวลากี่วันในการตรวจสอบภาษาหลังจากส่งแก · ต้องส่งบทคัดย่อให้ศูนย์ภาษาตรวจเมื่อไหร่ |

Read: a useful abstain signal flags many near-misses and few paraphrases. Near-misses flagged 26.5% vs Thai paraphrases 2.5% (each paraphrase flagged would be a right answer lost if used as a hard rule). Unreviewed labels.
