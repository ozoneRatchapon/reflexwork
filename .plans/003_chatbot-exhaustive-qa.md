# 003 — Exhaustive QA of the chatbot, then fix until dry

Started 2026-11-04 (requested: "try every possibility in the chatbot, write a checklist in the plan, fix what you find, keep going until done").
Build under test: main @ b7dd6e6 (PR #149: Rust is the default engine).

## Method
1. **Explore** — 8 explorers, each in its own headless Chrome (CDP, own port), each testing one angle and writing its full checklist to `/tmp/qa/<lens>/checklist.md` (copied into this file below). Nothing is sent to production (dead `?api=` / `?llm=` ports; AI only through the test proxy forwarder, capped).
2. **Merge** — one agent dedupes findings across explorers.
3. **Verify** — every finding is reproduced independently (2 verifiers for high/medium, 1 for low); each is classed confirmed / contested / rejected (intended design) / unverified.
4. **Critic + gap wave** — a completeness critic names what the checklists missed; explorers cover those gaps; their findings are verified the same way.
5. **Fix** — in severity order, each fix with a test; then **re-run** the explorers on the fixed build (regression + loop until a round finds nothing new).

Workflow script (re-runnable): `~/.claude/projects/-Users-ozone-projects-ReflexWork/c6e14295-708e-40c6-b0f8-735d72a3aff0/workflows/scripts/chatbot-exhaustive-qa-wf_aba459ba-01a.js`
Shared infra for the run: static server `127.0.0.1:8791` (submissions/ui), AI test forwarder `127.0.0.1:8793` (→ dev proxy, own key).

## Lenses
| key | angle |
|---|---|
| kb-retrieval | all 132 manual entries × title / 2 paraphrases / typo / topic word; scope guard; readability; number-first |
| programmes | 379 programmes: names, typos, levels, intl/special, codes, aliases, every aspect answer-first, follow-ups + undo, finder, filter box, tables vs data, JS vs Rust parity |
| conversation | smalltalk/mood, intake (login/data/system), advice, off-topic, injection, other languages, fee premises, not-found screen, topic picker, branch-order hijacking |
| ui-a11y | 5 viewports, zoom, keyboard, focus, contrast, aria, tap targets, double send, screenshots |
| robustness | dependency failures, offline, reload/back, JS-vs-Rust fuzz (400), URL params, hosts contacted, console errors, 300-question memory, throttled timing |
| ai-path | understand step, grounded rephrase, ai=off network silence, timeouts, proxy guard gaps (≤30 AI calls) |
| content | every KB entry read as a student, links, contradictions, stale years, card wording |
| security-pages | XSS in every render path, privacy/outbound requests, prod headers, other pages, overclaims |

## Run log
- Run 1 `wf_aba459ba-01a` (2026-11-04 00:57): died within a minute when the session stopped; the infra servers died with it. No results.
- Run 2 `wf_3a32a300-073` (2026-11-04 ~01:00): relaunched from the same script after restarting the static server (`python3 -m http.server 8791 --directory submissions/ui`) and the forwarder (`node scripts/llm_forward.mjs --port 8793`).

  - Died ~01:08 the same way (session ended mid-Explore; journal has only `started` entries). Only ai-path left a partial checklist; all partial output is archived at `/tmp/qa_run2_dead/`. Orphaned headless Chrome (96xx) and mock servers (88xx) were killed 2026-11-04.
- Run 3 (2026-11-04): relaunched from the same script on main @ a620576 (PR #150 is docs only, so the chat logic matches b7dd6e6). The session is held open until the workflow finishes.

## Results
Run 4 `wf_cba61ec9-532` finished 2026-11-04: 192 agents, 102 confirmed (8 high / 37 medium / 57 low), 1 contested (F43: two draft KB files served on prod), 0 rejected. Full list: `.plans/003_findings.json`.

### Fix log
- [x] F07 IT call link dialed 02-459-6022 -> 02-849-6022 (source: KB entries account_locked_it / account_login_problem, handover 2026-10-16).
- [x] F09 chips / choices keyboard + screen-reader operable (role=button, tabindex, Enter/Space).
- [x] F08 wellbeing branch (crisis / distress) before smalltalk. Hotline number deliberately not invented.
- [~] F01/F02 retrieval: question-filler stripping in query (JS + Rust, lockstep), colloquial aliases on 10 entries. 12 phrasings: 9 now right, APA escalates instead of a wrong entry. Benchmark 44/52 -> 43/52 answered, wrong 4 -> 3; slides/docs numbers updated. NOT done: dropping the s>=3 act branch (would change the golden Rust contract and lost a correct typo case), content-term gating.
- [x] Broad questions ("มีอะไรน่าสนใจ", "ต้องรู้อะไรบ้าง") -> starting-point chooser.
- [x] F05 follow-up no longer sticks to the old programme when the question names its own field, nor after a picker (browser-verified; legit 'แล้วค่าเทอมล่ะ' still works).
- [x] F70 a clearly matching staff answer (s>=6) now beats the programme resolver / finder (browser-verified with the mock /live-kb).
- [x] F04 generic fee questions ("ค่าเทอมเท่าไร", "…ปริญญาโท", "…ทั่วไป") and fee+field ("ค่าเทอมพยาบาล") open the fee finder. Scholarship generic left alone (benchmark expects scholarship_types).
- [x] F66 / F43(dup) /gap logged once via logGap, scrubbed (email, id/phone digit runs, name after 'ชื่อ') and cut to 500 chars; intake messages are not logged. Browser-verified against a local mock. Names typed WITHOUT 'ชื่อ' cannot be detected - the privacy note under the input says not to type personal data.
- [x] F10 ?api= / ?llm= accepted only for the shipped workers, loopback or same origin (browser-verified: an evil.example override makes no request to it). approved_at bounded so a huge value cannot throw.
- [x] F44 privacy / learning overclaims reworded (chat swimlane, slide 5, slide 9 names try.html, feedback notes, index.html); privacy note under the input.
- [x] UI group: long text wraps (overflow 0 verified), scroll-margin under sticky nav, evidence toggle on narrow screens, one vote per answer + retry on failure (verified), non-string / over-long AI text rejected, IME composition guard, sticky input on short/touch screens. NOT browser-verified: narrow-screen toggle layout, IME with a real Thai keyboard, landscape sticky input.
- [x] F43 (contested) checked read-only on 2026-11-04: the two drafts are served only from a stale edge-cache copy on the alias; the live deployment does not contain them. Details and owner decisions: `.plans/005_kb-owner-decisions.md`.
- [x] Conversation group (browser-verified): F20 greeting/thanks lead-in stripped; F68 whole-utterance restart phrases (ยกเลิก/เริ่มใหม่/ไม่รู้) show starting points, 'ยกเลิกการลงทะเบียน…' still reaches the KB; F74 staff answers never rephrased by the AI path; F9 honest notice for programme questions while programmes.json loads/fails (tested with a copy of the UI without the file); F45 student-desk relabelled as a simulation. Still wrong: 'ขอบคุณครับ แล้วลาพักได้กี่ภาค' (the remainder 'ลาพักได้กี่ภาค' itself is not understood - retrieval, not the lead-in).
- [x] G16 + G22 dates against the clock (browser-verified on rust and js with a Date override at 2026-11-04 / 2026-12-16 / 2027-11-04): new `<today>` block (Bangkok day, Thai date-span parser); schedule cells, cut-off lines and dated KB schedule entries tagged ผ่านไปแล้ว / อยู่ในช่วงนี้ / วันนี้; an open announcement whose every cut-off passed is ⚪ with no apply button; a closed one with future rounds and no notice says so; snapshot older than 30 days gets a ⚠️ age warning (cards, finder). Test: tests/date_awareness.test.mjs.
- [x] G18 a CE year in a summer question is a calendar year ('summer 2027' = ฤดูร้อน 2569; 'summer 2026' = 2568 -> the no-year guard) unless written as ปีการศึกษา; the no-year reply echoes how the CE year was read (browser-verified on rust).
- [x] G17 'now / still in time' questions (browser-verified rust + js): `timeIntent` (time word + nothing but schedule words/fillers/dates left) shows the dated schedule entries nearest today first, each labelled กำลังอยู่ในช่วงนี้ / ยังไม่ถึง / ผ่านไปแล้ว (`renderChooser`, shared with the overview chooser); 'ยังทันไหม' no longer opens a dentistry picker, 'ตอนนี้ภาคเรียนอะไร' / 'ตัดรอบ…ผ่านไปแล้วหรือยัง' no longer open the 379-programme finder; '<programme>ยังทันไหม' is that programme's status (status pattern + Rust patterns regenerated, wasm rebuilt, golden unchanged). Still not understood (pre-existing): 'ตอนนี้ลาพักได้ไหม'.
- [x] F14 term/year shorthand (browser-verified rust + js): `normTermYear` before search and the guard, only for registration/schedule talk (เทอมแรก/เทอม 1/ภาค 1 -> ภาคต้น, เทอมสอง -> ภาคปลาย, ซัมเมอร์ -> ฤดูร้อน, 1/2569 and 2/69 -> term + year, ปี 69 -> ปีการศึกษา 2569; 'ค่าเทอม' protected). The year/term ask lists every matching schedule in calendar order (6 for 'ลงทะเบียนเมื่อไหร่'); two named years offer both. Seen, not fixed: 'ค่าเทอม 1 ภาคเท่าไร' gets a loose programme picker on 'ภาค' (ภาคพิเศษ), which was already the case before this change.
- [x] F15 admissions schedule (browser-verified rust + js): colloquial aliases on gm_schedule_2570_round1 (benchmark unchanged: 43/52 answered, 3 wrong); 'สมัครเรียนปี 2570 / รอบแรก / ภาคต้น 2570 รอบ 1' now answer round 1, 'ปี 2569' gets the no-year guard; new scope kind `no_round` ('รับสมัครรอบ 2' -> the manual has round 1 only, no sample announcement); scope chips escaped. Left: 'เปิดรับสมัครวันไหน ปิดวันไหน' keeps the generic 'differs by year and round' entry (honest), English 'registration schedule' is ambiguous (registration vs admissions).
- [x] F16 not-found branch (browser-probed 19 questions on rust; test tests/not_found_gate.test.mjs): `hasStudyIntent` ignores พักเรียน / ผลการเรียน / ตารางเรียน / ฝ่ายรับสมัคร / ปฏิทินการศึกษา / จบการศึกษา …; the loose programme match opens the finder only when the question reads as a misspelt programme name (`nearSpelling` >= 0.8). Aliases on admission_last_term, gm_admissions_office_contacts, leave_of_absence, gm_registration_proof, gm_registration_graduation (answers unchanged). Benchmark run 005 (commit 6f314ff): recall@1 43/50 = 86 %, answered 44/52, 3 wrong; slides, index, README, METHOD §5 and pitching docs updated. Left: bare 'ประกัน' still resolves strictly to the 2 information-assurance programmes (resolver, shared with Rust).
- [ ] ~65 medium/low findings left + F43-contested (draft KB files on prod). Server side not touched: kernel-worker /llm and write endpoints still open (finding 32).
