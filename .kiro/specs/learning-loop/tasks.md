# Tasks — Self-improving KB Learning Loop

> Kiro spec-driven workflow · phase 3/3 · derived from design.md
> Status reflects what is implemented + deployed. [x] done · [ ] todo

## R1 — Gap capture
- [x] 1.1 `gap_log` table + `POST /gap` + `GET /gaps` (aggregate by key, hits)
- [x] 1.2 PII masking (email/phone/student-id) before store
- [x] 1.3 Dashboard "KB Gap Backlog" card
- [x] 1.4 Wire web + LINE escalate branches to log gaps

## R2 — Entry confidence
- [x] 2.1 `entry_conf` table + EMA update in `POST /feedback` (entry_id)
- [x] 2.2 `GET /entry-conf` (weakest first)
- [x] 2.3 Web feedback sends `entry_id` for KB-sourced answers
- [x] 2.4 Dashboard "👎-prone entries" card

## R3 — Draft → approve
- [x] 3.1 `kb_draft` table + `POST /kb-draft` / `GET /kb-drafts` / `POST /kb-approve`
- [x] 3.2 Approve emits ready-to-file KB markdown (ASCII slug + fallback)
- [x] 3.3 LINE `#kb คำถาม | คำตอบ` staff command → draft
- [x] 3.4 `POST /kb-autodraft` — LLM drafts candidates from top gaps
- [x] 3.5 `LLM_PROXY_SVC` service binding (worker→worker fix)
- [x] 3.6 Dashboard "Auto-draft" button + drafts review card

## R4 — Unattended
- [x] 4.1 `scheduled()` handler calling `autodraftCore`
- [x] 4.2 wrangler cron `0 2 * * *`, bounded 3 drafts/run

## R5 — Security & privacy
- [x] 5.1 Optional `STAFF_TOKEN` guard on `/kb-*`
- [x] 5.2 PII masking keeps the public repo clean (covered by 1.2)
- [ ] 5.3 Rate-limit hardening beyond per-isolate best-effort (future)
- [ ] 5.4 Dashboard auth (currently open; add before real production)

## Verification
- [x] Unit tests for masking / EMA / classifier (tests/)
- [x] CI workflow runs tests on push
- [ ] Load test + D1 backup runbook (future, production hardening)
