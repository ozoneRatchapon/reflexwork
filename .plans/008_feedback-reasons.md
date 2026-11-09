# 008 - Feedback with reasons: fix answers at the source (after the 2026-11-07 pitch)

Status (2026-11-09): step 7 done. Steps 1-5 wait on an owner decision (below); step 6 also needs a PDPA check. The pitch freeze is over.

## Owner decision needed before steps 1-5 (2026-11-09)
Steps 2, 4 and 5 are new logic in the kernel worker (`integrations/kernel-worker/worker.mjs`, plain JS: no wasm, `ensureWasm` is a no-op); steps 1 and 3 are page / dashboard views that only mean something once step 2 stores the reason. The owner's rule since 2026-11-08 is "new development in Rust from the start", and no worker logic has been added in JS since. Choose one:
- (a) build steps 2/4/5 in the existing JS worker (an accepted exception, like linkify), with the D1 changes as `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS`; or
- (b) put the logic in Rust first: the reason enum, the queue order and the fix-event before/after numbers in a crate the worker loads as wasm (needs the cold-start measurement plan 009 asks for LINE), or a Rust worker.
Either way the worker change reaches production only with a D1 backup + worker deploy (owner go-ahead).
Goal: a 👎 should tell the owner WHAT is wrong with WHICH entry, so the fix lands in the KB entry (the source), and we can measure that the fix worked.

## What exists today (checked 2026-11-06 in code)
- Chat: every answer has 👍/👎 (`fbUI` in `submissions/ui/chatbot.html`); it sends `input`, `reward`, `proof`, `vote_id` and `entry_id` to `POST /feedback`.
- Worker (`integrations/kernel-worker/worker.mjs`, `feedback()`):
  - `feedback_log(proof, reward, at)` dedups one vote per rendered answer; the question text is not stored.
  - `entry_conf(id, conf, up, down, at)`: EMA per KB entry (0.85·prev + 0.15·target).
  - Counters `feedback_count`, `feedback_up`, `feedback_down`, `policy_version`.
- Dashboard: `GET /entry-conf` lists the weakest 30 entries (`#confrows`).
- Gaps: `POST /gap` → `gap_log(qkey, sample, hits, last_at, source)`; `kb-autodraft` drafts from top gaps; `kb_draft` → staff `kb-approve`.
- Tests: `tests/feedback_votes.test.mjs`, `tests/dashboard_honest.test.mjs`, `tests/dashboard_poll.test.mjs`, `tests/faq_drafts.test.mjs`.

## Gaps
1. 👎 carries no reason, so the owner has to guess what to fix (wrong fact / off-topic / outdated / incomplete).
2. `entry_conf` is only displayed (dashboard list, federation preview). It does not change routing or answers. Say "shows which entries to check", never "learns".
3. `kb_draft` has no target entry: every draft is a NEW entry. There is no "fix entry X" draft, so a fix can duplicate an entry.
4. No closed loop: after an entry is fixed, nothing shows whether its 👎 rate dropped or the field eval improved.
5. Wording to check: `feedback()` returns `note: 'feedback recorded; policy adapts (EMA on the serving kernel)'` while `policy_version` is only a counter. Likely an overclaim (same class as F44). Reword when this work starts.

## Plan (ordered; each step ships with its test)
- [ ] 1. Reasons on 👎 (chat). After 👎, show 4 fixed chips: `ตอบผิด`, `ไม่ตรงคำถาม`, `ข้อมูลเก่า`, `ไม่ครบ`, plus `ข้าม`. No free text in this step (no PII, no spam text). Keyboard and screen-reader accessible. Send `reason` as an enum.
  - Test: page e2e (chips render, one send per answer, skip sends nothing extra); `node tests/page_syntax.test.mjs`, `node tests/chat_e2e.test.mjs`.
- [ ] 2. Worker accepts `reason` as a strict enum (`wrong|off_topic|outdated|incomplete`; anything else is dropped). New table `entry_reason(id, reason, n, last_at)`, keyed by `entry_id`; no question text stored. Same rate limit and vote dedup.
  - Test: extend `tests/feedback_votes.test.mjs` (enum validation, counts, dedup).
- [ ] 3. Dashboard "entries to fix" queue: group by `entry_id`, show counts per reason, the entry title, its `source_url`/`source_page`, and the last fix date. Sort by 👎 count then reason.
  - Test: `tests/dashboard_honest.test.mjs` (labels say "to check", not "learned").
- [ ] 4. "Fix this entry" drafts: add `target_id` to `kb_draft`. The draft (by staff, or AI-drafted from the reason + the current entry text + the source) edits the existing entry; approval updates that entry instead of creating a new one. AI drafts stay `pending` until a human approves (unchanged rule).
  - Test: extend `tests/faq_drafts.test.mjs`; approve with `target_id` replaces, without it creates.
- [ ] 5. Close the loop. Record a fix event `(entry_id, fixed_at)`. Show 👎 rate before vs after the fix on the dashboard. After each batch of approved fixes run `node benchmark/field/official_faq_eval.mjs` and `benchmark/compare/run_all.sh`, and file the result under `benchmark/`.
- [ ] 6. Optional, only after 1–5 work and a PDPA check: an optional short "what is the right answer?" text box, PII-masked before storage, shown only to staff, never served to users directly.
- [x] 7. Reword the `/feedback` note (gap 5) and any page text that says the system learns by itself. (2026-11-09: the `/feedback` note was already honest since 121e086 - 'entry confidence = Beta posterior mean of its vote counts'; its code comment still said 'EMA-style ... makes the system learn', now 'only ranks entries for staff to check; never changes an answer or a route; policy_version is a vote counter'. `slides.html`: slide 08 kicker/heading/footer no longer say 'ยิ่งใช้ยิ่งฉลาด' / 'ปิดช่องเอง' (staff approve every entry; 👎 puts an entry on the 'to check' list); slide 14 'Self-learning: ยิ่งใช้ ยิ่งคัด AI แม่นขึ้น' now says the EMA weight update is in the native `reflex-serve` (true: `serve.rs` calls `ema_update`), is unmeasured, and is NOT used by the deployed chat; the unsupported 'every learning step has a BLAKE3 fingerprint' line is gone. The chat's BANDIT comment no longer says the server 'learns'. `tests/pitch_deck.test.mjs` now also bans the learns-by-itself wording in slides.html (23/23). Not changed (submitted / repo documents, owner's call): `submissions/SUBMISSION-TEXT.md` lines 14 and 34, `submissions/concept-paper.md` 139/188, `README.md` 83 still say 'ยิ่งใช้ยิ่งฉลาด' / 'self-improving KB' / 'entry confidence (EMA)'.)

## Rules
- A user's reason never changes an answer by itself. Only a staff-approved entry change does.
- No free text until step 6 and a privacy note next to the box.
- Do not claim results (fewer 👎, better accuracy) until step 5 has measured them.
- Before deploy: D1 backup (`integrations/kernel-worker/backup-d1.sh`), schema change by `ALTER TABLE ... ADD COLUMN` (as `kb_draft` already does).

## What can be said at the pitch (true today)
"Every answer has 👍/👎, and questions the manual cannot answer go to a staff queue. Sending the reason with a 👎 so the owner fixes the right entry is our next step." Do not say the system learns or improves by itself.
