# Scaling plan - what breaks first when many people (or many customers) arrive at once

Written 2026-11-06 from the code as it is today. Facts are marked with where they come from; anything not measured is listed as unknown at the end.
Nothing in this plan was built before the 2026-11-07 pitch (code freeze); item 0.x are the first things to do after it.

## Two different kinds of "more"
| | what grows | what it stresses |
|---|---|---|
| **More users** (students asking) | questions per minute, open tabs | the few server calls the page makes; the AI quota |
| **More customers** (agencies adopting) | tenants, manuals, owners | tenant isolation, per-tenant staff access, onboarding effort, content approval |
Users are the easy one. Customers are harder because the bottleneck is each owner preparing and approving a manual, not servers.

## What already scales (and why)
- Static page + data on Cloudflare Pages (CDN).
- **Search runs in the user's browser** (Rust/WASM or the JS twin): a question costs the server nothing, so traffic does not add server load per question.
- AI is used on three narrow paths only (rewrite when a direct search finds nothing, rephrase for advice, drafts for staff) and the page has a graceful fallback
  (the manual text is shown when the AI is slow, down or rate-limited).
- An agency that adopts the pack calls none of our servers by default (`docs/adopt.md`).

## What breaks first, in order (evidence in the code)
| # | risk | evidence | effect |
|---|---|---|---|
| 1 | **`/live-kb` polling.** Every open tab asks every 15 s and the worker queries D1 each time with `Cache-Control: no-store` | `submissions/ui/chatbot.html` (`setInterval(...refreshLiveKb, 15000)`), `integrations/kernel-worker/worker.mjs` `liveKb()` | load follows OPEN TABS, not questions: 10,000 tabs = ~667 D1 reads/s for data that rarely changes |
| 2 | **Rate limiter is per isolate, in memory, best effort** (said so in the code) | `worker.mjs` `rateOk()`, same pattern in `llm-proxy/worker.mjs` | not a real global limit; one shared campus IP is one bucket (seen with the dashboard, F44) |
| 3 | **AI quota** (Gemini through the proxy; 18 s budget) | `llm-proxy/worker.mjs` | when exhausted the page falls back to manual text, so answers keep coming but the "understand" and advice paths get worse |
| 4 | **D1 writes** (gap log, votes, drafts) go to one database | `worker.mjs` | fine at pilot scale; unknown at high write rates |
| 5 | **No tenant concept on the server, one shared staff token** | `worker.mjs` (`env.STAFF_TOKEN`; no tenant column anywhere) | two customers on one kernel would share gaps, votes, live answers and dashboard access |
| 6 | **Open server-side endpoints already known** (`/llm`, write endpoints; plan 003 finding F33) | `.plans/003_chatbot-exhaustive-qa.md` | must be closed before any personal data or paying customer |

## Plan
### 0. Right after the pitch (hours to days, low risk, no data model change)
- 0.1 Edge-cache `/live-kb` for ~10 s (`Cache-Control: public, max-age=10, s-maxage=10, stale-while-revalidate=30`, plus ETag/304) and poll at 30-60 s with jitter. D1 reads become a handful per minute per region whatever the number of tabs.
- 0.2 Replace the per-isolate limiter with Cloudflare rate-limiting rules (WAF) keyed on IP + path; keep the in-worker one only as a backstop.
- 0.3 AI budget per hour with a circuit breaker in the proxy (skip `/rewrite` first, then advice) and an alert when it trips.
- 0.4 **Load test before claiming anything** (k6 or similar): a realistic mix - 95 % static + local search, tabs polling, 3 % `/gap` and `/feedback`, 2 % AI paths. Record the numbers in `benchmark/`.
- 0.5 Workers analytics + alerts on 429/5xx, D1 latency and proxy fallback rate (`guard-emptied`, timeouts).
- 0.6 Close F33 (authenticate `/llm` callers, protect write endpoints).

### 1. Several agencies at once (weeks)
- `tenant_id` on every table and every query; tenant derived from the authenticated principal, never from the request body.
- Staff access per tenant through SSO / Cloudflare Access (retire the shared token); roles: owner, editor, viewer.
- AI quota and cost metering per tenant; per-tenant rate limits.
- Onboarding pipeline: manual files -> build -> preview URL -> owner approval -> publish (extend `scripts/new_agency.mjs`; keep `tests/agency_pack.test.mjs` as the isolation check: no request may leave the pack unless the tenant configured it).
- Content governance per tenant: owner per entry, expiry date, duplicate/contradiction check on import (F19 shows this matters at 132 entries).

### 2. A much bigger manual (months)
Measured (`node benchmark/scale/probe.mjs`, this machine, timing only - accuracy at scale was NOT measured):

| entries | search ms / question (JS twin) | index size |
|---|---|---|
| 132 (today) | 2.4 | 0.1 MB |
| 1,320 | 18 | 1.0 MB |
| 6,600 | 90 | 4.9 MB |

Brute force grows linearly. Order of work: (a) an inverted index over the same character-trigram scoring - same results, no model, far less work per query;
(b) shard the index per tenant and load lazily; (c) only when the index no longer fits comfortably in a browser (a few MB), serve search from a Worker running the
SAME Rust kernel compiled to WASM - the golden contract (`benchmark/golden/`, `scripts/wasm_golden_check.mjs`) is what proves the server answers match the page.
Hybrid dense retrieval only if measured recall on real questions demands it.

### 3. High write rates
Queue (Cloudflare Queues) for gap log and votes, batched into D1; per-tenant databases if one D1 becomes the limit; read path through cache/KV.
`katgpt-assign` (katgpt-rs: spec-driven assignment of objects to containers under capacity / balance / movement limits, deterministic) is a candidate for placing tenants on shards - NOT evaluated here.

## Accuracy does not come for free with size
Adding entries reduces "question not covered" cases but adds look-alike entries that compete. At 132 entries, for questions the manual lacks, Thai answers an unrelated entry
10 of 14 times (`benchmark/field/results/002_*`). A calibrated abstain gate does not fix it with the signals we have (`benchmark/abstain/001_2026-11-06.md`);
a query-coverage signal is a lead (about 6-7 points) that needs more labelled negatives. A growing manual needs a growing labelled question set and a regression run on it.

## Unknown (do not quote numbers for these)
Requests per second the current workers sustain; the Cloudflare plan limits in force; D1 write ceiling; Gemini quota in force; accuracy at 1,000+ entries; behaviour of the LINE worker under a burst.

## What to say if asked at the pitch
"Search runs in the user's browser, so a question adds no server load. What we must change as we grow is three things we already know: how often tabs poll for staff answers, rate limiting that is per server instance today, and separating each agency's data and staff access. We have not load-tested yet and we do not claim a capacity number."
