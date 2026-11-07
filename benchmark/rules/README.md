# Hand-written rules: how often they fire (2026-11-07)

Why: the chat has many hand-written regex rules and branches in `submissions/ui/chatbot.html`. Before replacing or removing any,
measure which ones actually decide answers. Read-only; AI and kernel are off; no real-user log is read (test question sets only).

| run | what | file |
|---|---|---|
| 001 | does each regex constant **match** the question text (62 rules, 387 questions) | `001_2026-11-07.md` (`rule_hits.mjs`) |
| 002 | which **branch** answers each question in the real page (headless Chrome), before the fee fix | `002_2026-11-07_branches.md` + `.json` (`branch_hits.mjs`) |
| 003 | same as 002 after the fee fix | `003_2026-11-07_branches_after_fee_fix.md` + `.json` |

## Reading
- **The KB search decides most answers, not the special rules.** Run 003, 387 questions:
  - 285 are answered from a KB entry (74%).
  - 77 are declined or handed to staff.
  - 16 are offered a choice of entries.
  - Only 9 go to a special branch: the fee finder, the programme finder, the wellbeing reply, the year/term question, and the "too broad" programme case.
- **The test pool is FAQ-heavy, with few programme questions.** It under-counts the programme rules (`_P_*`). Programme-name questions are covered separately by `benchmark/compare/programme_names.mjs` (0 wrong cards in 1,923).
- **18 of 62 rules match no test question** (list at the end of 001). Some of them work on answer or URL text, not on questions: `_SNAPSHOT_RE`, `_L_HOST`, `_P_ZERO`, `_P_PAREN`. The others are untested by these sets, which is **not** proof they are dead. Each needs a test question or a real-log check before anyone removes it.
- **Bug found and fixed (002 → 003): non-tuition fees opened the tuition finder.** The fee rule fired on any fee word, so these three questions got the tuition finder:
  - "What is the fee for taking the TOEFL ITP?"
  - "What are the MU GRAD Plus examination fees?"
  - The staff question "ค่าใช้จ่ายอื่นๆ ที่มาพร้อมกับการซื้อวัสดุ…"
  - Now `isTuitionQuestion()` asks for a tuition word, or a fee word without an exam / application / fine / transfer / procurement subject (`_P_NONTUITION`).
  - After the fix, the two English questions are answered from their own KB entries and the staff question is declined.
  - Only these 3 of 387 questions changed branch.
  - Test: `tests/tuition_scope.test.mjs`.

## Next
- **Real-usage check.** Run the same count on real questions, such as the PII-masked gap log, but only with the owner's permission. The gap log holds only questions the bot failed on, so it is biased.
- **For each rule with 0 hits,** either add a test question that needs it or remove it, one rule per change, with the full test suite.
