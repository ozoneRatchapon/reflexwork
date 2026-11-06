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

> **2026-11-05 - for the 5-minute pitch use the 3 moments in `10-pitch-script-5min.md` scene 2** (open `chatbot?view=judge`): the open programme
> **ชีวสารสนเทศทางการแพทย์** (open, fee amounts), `แล้วค่าเทอมล่ะ` with the evidence panel, and the staff loop on `ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน`.
> `demo_smoke.mjs` steps 2c/2d check the first two on the live site; `tests/chat_e2e.test.mjs` rehearses all three on a mock kernel (never writes to production).
> The table below is the longer 6-minute demo. Its programme (clinical psychology) is **closed** and its 2570 announcement has **no fee rates** - do not open the pitch with it.
> The staff loop on production writes to the real kernel: use a verified answer, retract it right after, and keep the dashboard staff token handy.

## The demo (≈ 6 min) — type exactly this
| # | type | the audience sees | say |
|---|---|---|---|
| 1 | `อยากสมัครเรียนจิตวิทยาคลินิก` | that programme's card: status (as shown on the Graduate School's site), plans, schedule, buttons to the official pages | "From the school's own announcement, word for word. Status is a dated snapshot — the card says the date." |
| 2 | `แล้วสอบสัมภาษณ์วันไหน` | first line: **สอบสัมภาษณ์: รอบ 2 พ. 24 ก.พ. 2570 · รอบ 3 พ. 21 เม.ย. 2570**, then "ตีความว่าถามเรื่องกำหนดการของ …" with an *undo* button; the rest of the card folded (smoke step 2b) | "Ask one thing, get that thing on the first line. It tells you how it read the question, and lets you say no." |
| 2x | (do not use) `แล้วค่าเทอมล่ะ` on this programme | its 2570 announcement has **no fee rates**, so the reply is "ยังไม่ระบุอัตรา". Use step 3 for a fee table | |
| 3 | `ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก` | Thai / international rates per plan | "Straight from the announcement. It adds nothing up and invents nothing." |
| 4 | `เรียนไรดี` | level → faculty → open now buttons with live counts (379 → 240 → 133 → 12) | "There is no right answer to 'what should I study', so it narrows the official list instead of picking one." |
| 4b | `อยากทำเกี่ยวกับคอม` (or `ทำงานอะไรดี`) | "no single right answer, I do not predict jobs or pay" + the official list narrowed by area (17 programmes for computer/data) + interest chips + a link to the university's own career-based tool | "If you start from a career, it narrows the official list by your interest and sends you to the university's own recommender. It does not invent career advice." |
| 5 | `เรียนรายยย` then `กายอุปกณ์` | never a dead end; a picker of the nearest names | "Sloppy typing still lands somewhere useful." |
| 6 | `ลืมรหัสผ่านเข้า e-Thesis` | `e-Thesis` and `account.mahidol.ac.th` are links | "Wherever the answer sends you, you can click." |
| 7 | `ช่วยแนะนำเรื่องส่ง Turnitin Originality Report` | the "KB-grounded + rephrased" badge (≈ 3–6 s) | "The LLM only rephrases entries the knowledge base already gave it; figures it prints are checked against them." |
| 8 | point at the evidence panel | kernel strip, route, replay hash | "Same input, same hash — anyone can replay it." |

## Two views of the chat page (from 2026-11-03)
- **Default = student view:** only the question box, example chips and answers (no counters, mood chip, evidence panel or jargon). Step 8 of the demo clicks **ดูหลักฐานเบื้องหลัง** to switch to the judge view.
- **Judge view:** evidence panel + counters + mood chip. Open it from the start with `?view=judge`; force the student view with `?view=student`. The choice is remembered per browser.
- Backup tab: `reflexwork.pages.dev/chatbot?ai=off` (no AI call).

## What you can say — and what not (details: `docs/METHOD.md` §6, §8)
**Say:** facts come from the official pages / the approved FAQ, never from the model · reproducible · +42 points for character trigrams over word tokens on Thai (p < 0.001) · 0 wrong programme cards on 1,915 mistyped names · microseconds to route, milliseconds to retrieve vs hundreds of ms for an LLM call · every claim above has a command that re-measures it.

**Don't say:**
- "neuro-symbolic" (no neural network in the answering path);
- "the kernel gate decides when to call the LLM" (in the web chat the retrieval score decides; the gate cannot exceed 0.451);
- "the system improves automatically from users' 👍/👎": the buttons only started working on 2026-11-03 (before, each click threw an error), the effect of votes on answer quality is not measured, and per-answer counting needs the kernel worker deploy (`docs/METHOD.md` §8.6). Say: "votes are collected per answer and reviewed by staff";
- "proof" for the BLAKE3 hash (it is a replay fingerprint, not a proof of correctness) — the UI, slides, README and concept paper now say *fingerprint*; `docs/pitching/*.md` Q&A notes may still say proof, so say fingerprint out loud;
- that slide 6 shows live data: it is an example screen filled with the **measured** test-set figures (44 of 52 answered unaided, 3 wrong among them) and says so; the real dashboard is `/dashboard`;
- that statuses are live (they are a snapshot, dated on every card).
- that it "declines when it does not know": on 34 hand-written out-of-scope questions it still answered 13 % (English) / 17 % (Thai) with an unrelated entry (25 % / 39 % before the 2026-11-03 fix) (`docs/METHOD.md` §5 F). If a judge asks something off-topic, the honest line is "it usually declines, not always — we measured it and know why";
- that it "works in English": it understands English and mixed Thai–English, but **answers in Thai** (it refuses honestly when nothing matches).

## Staff answer goes live — stage step 5 (added 2026-11-03)
**Before the talk, on the demo laptop:**
1. Open `reflexwork.pages.dev/dashboard` in a second tab.
2. Click **🔑 ตั้ง Staff Token** and paste the STAFF_TOKEN (the owner has it; it is stored only in that browser).
3. Type a name in "ชื่อผู้ตรวจ".
4. Keep this answer in a note, ready to paste. It was checked on 2026-11-03: the library site has a "เวลาเปิด-ปิดทั้งหมด" section.

   > ดูเวลาเปิด-ปิดของหอสมุดและคลังความรู้ มหาวิทยาลัยมหิดลทุกแห่งได้ที่ https://www.li.mahidol.ac.th/ (หัวข้อ "เวลาเปิด-ปิดทั้งหมด")

**On stage (≈ 45 s):**
1. In the chat, ask `ห้องสมุดเปิดกี่โมง`. You get "ยังจับใจความไม่ได้", and the question goes to the dashboard's gap list.
2. Switch to the dashboard tab. Click **ตอบ** next to that question, paste the answer, and click **✅ บันทึกและอนุมัติ (ขึ้นแชท)**.
3. Switch back to the chat tab. Coming back to the tab refreshes at once. Ask again: you see **📝 เจ้าหน้าที่ตอบ**, the date, and "ยังไม่อยู่ในคู่มือหลัก".

**If it fails** (no token, kernel slow): say "ขอโชว์จากภาพที่อัดไว้" and show `demo_backup/51_dashboard_live.png`, then `50_staff_live.png`.

**After the pitch:** retract it ("ถอนออกจากแชท") or merge it into the manual with the markdown the approval shows.

What to say:
- "Every answer is approved by a person; it can be taken back."
- Do **not** say "the system learns by itself".

## Web only, and protect the AI quota (added 2026-11-03)
- The stage demo is the **web page only**. LINE uses the same manual, but its search declines off-topic questions less well than the web's. If asked: "there is a LINE channel on the same manual"; do not demo it.
- **Test proxy:** benchmarks go through `node scripts/llm_forward.mjs`. It forwards to `reflexwork-llm-proxy-dev`, which has its own key, and needs `--prod` to touch production. Until the second key is set (`echo KEY | npx wrangler secret put GEMINI_API_KEY --env dev` in `integrations/llm-proxy`), the test proxy returns no AI. Benchmarks then show the AI-off numbers, and the live quota is safe.
- **Gemini quota:** on 2026-11-03, after a day of AI-heavy benchmark runs, every model returned `429 RESOURCE_EXHAUSTED`. The page still worked (KB text shown, smoke step 8 = warning).
  - **Do not run** `odd_e2e`, `coverage_probe` with AI, or `finish31.sh` on 11-06/11-07.
  - Run `demo_smoke.mjs` once on the morning of the pitch. If step 8 warns, skip demo step 7 (AI rephrase) and keep the `?ai=off` tab ready.

## If something breaks on stage
| symptom | what to do |
|---|---|
| step 7 shows the verified KB entry as plain text (no rephrasing) | fine — say "if the model is unavailable it shows the verified entry as it is" |
| a programme card says "ปิดรับสมัครแล้ว" for a programme you expected open | it is what the school's page shows (even for programmes that still list 2570 rounds); say so |
| page does not load | `submissions/deploy_pages.sh main` (≈ 1 min), then re-run `node scripts/demo_smoke.mjs` |
