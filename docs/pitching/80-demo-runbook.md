# Demo runbook — Pitching Day (Sat 2026-11-07)

Everything below was run against the live site on 2026-11-03; `node scripts/demo_smoke.mjs` re-runs it.

## T-30 min — one command
```
node scripts/demo_smoke.mjs            # live site; writes nothing to production (kernel API is pointed at a dead port)
```
| you see | do |
|---|---|
| `✓ all hard checks passed` | go |
| `! catalogue is N days old` | `gh workflow run programmes-refresh.yml` → merge the PR it opens → `submissions/deploy_pages.sh main` (≈ 30 min; do it on 11-06) |
| `! 8. the LLM did NOT answer …` | the demo still works (the page falls back to the KB text). Skip step 8, or read `detail` (see `docs/METHOD.md` §8.5). Add `--require-llm` to make this a hard failure |
| any `✗` | do not go on stage with that step; the line says what was seen |

Also the day before: remove the dead local-model tunnel (`OLLAMA_URL` secret answers 404) so no request wastes time on it.

## The demo (≈ 6 min) — type exactly this
| # | type | the audience sees | say |
|---|---|---|---|
| 1 | `อยากสมัครเรียนจิตวิทยาคลินิก` | that programme's card: status (as shown on the Graduate School's site), plans, schedule, buttons to the official pages | "From the school's own announcement, word for word. Status is a dated snapshot — the card says the date." |
| 2 | `แล้วค่าเทอมล่ะ` | "ตีความว่าถามเรื่องค่าธรรมเนียมของ …" + that programme's fee table, with an *undo* button | "It tells you how it read the question, and lets you say no." |
| 3 | `ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก` | Thai / international rates per plan | "Straight from the announcement. It adds nothing up and invents nothing." |
| 4 | `เรียนไรดี` | level → faculty → open now buttons with live counts (379 → 240 → 133 → 12) | "There is no right answer to 'what should I study', so it narrows the official list instead of picking one." |
| 5 | `เรียนรายยย` then `กายอุปกณ์` | never a dead end; a picker of the nearest names | "Sloppy typing still lands somewhere useful." |
| 6 | `ลืมรหัสผ่านเข้า e-Thesis` | `e-Thesis` and `account.mahidol.ac.th` are links | "Wherever the answer sends you, you can click." |
| 7 | `ช่วยแนะนำเรื่องส่ง Turnitin Originality Report` | the "KB-grounded + rephrased" badge (≈ 3–6 s) | "The LLM only rephrases entries the knowledge base already gave it; figures it prints are checked against them." |
| 8 | point at the evidence panel | kernel strip, route, replay hash | "Same input, same hash — anyone can replay it." |

## What you can say — and what not (details: `docs/METHOD.md` §6, §8)
**Say:** facts come from the official pages / the approved FAQ, never from the model · reproducible · +42 points for character trigrams over word tokens on Thai (p < 0.001) · 0 wrong programme cards on 1,915 mistyped names · microseconds to route, milliseconds to retrieve vs hundreds of ms for an LLM call · every claim above has a command that re-measures it.

**Don't say:**
- "neuro-symbolic" (no neural network in the answering path);
- "the kernel gate decides when to call the LLM" (in the web chat the retrieval score decides; the gate cannot exceed 0.451);
- "the system improves automatically from users' 👍/👎": the buttons only started working on 2026-11-03 (before, each click threw an error), the effect of votes on answer quality is not measured, and per-answer counting needs the kernel worker deploy (`docs/METHOD.md` §8.6). Say: "votes are collected per answer and reviewed by staff";
- "proof" for the BLAKE3 hash (it is a replay fingerprint, not a proof of correctness) — the UI, slides, README and concept paper now say *fingerprint*; `docs/pitching/*.md` Q&A notes may still say proof, so say fingerprint out loud;
- that slide 6 shows live data: it is an example screen filled with the **measured** test-set figures (44 of 52 answered unaided, 5 wrong among them) and says so; the real dashboard is `/dashboard`;
- that statuses are live (they are a snapshot, dated on every card).

## If something breaks on stage
| symptom | what to do |
|---|---|
| step 7 shows the verified KB entry as plain text (no rephrasing) | fine — say "if the model is unavailable it shows the verified entry as it is" |
| a programme card says "ปิดรับสมัครแล้ว" for a programme you expected open | it is what the school's page shows (even for programmes that still list 2570 rounds); say so |
| page does not load | `submissions/deploy_pages.sh main` (≈ 1 min), then re-run `node scripts/demo_smoke.mjs` |
