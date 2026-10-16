# Design — Self-improving KB Learning Loop

> Kiro spec-driven workflow · phase 2/3 · implements requirements.md

## Architecture

```
user → kernel (gate σ, confidence, abstain, BLAKE3)
   ├ factual  → FastPath (KB, 0 token)
   ├ advice+KB→ grounded hybrid (KB ground + LLM rephrase)
   ├ abstain  → staff + gap log
   └ personal → intake → staff + gap log
                         │
   feedback 👍/👎 ────────┤
                         ▼
   gap_log (R1)   entry_conf (R2)   kb_draft (R3)
         │               │                │
         └──── dashboard cards (maintainer sees all three) ───┘
                         │
         auto-draft (R3/R4): top gaps → LLM → pending draft
                         │
                 staff approve (one click) → KB markdown → rebuild
```

## Components (Cloudflare Workers + D1)
| component | role | requirement |
|---|---|---|
| `kernel-worker` | routing + all loop endpoints + daily cron | R1–R5 |
| `llm-proxy` | LLM path (local Ollama default, Gemini fallback), grounding | R3 |
| `line-worker` | LINE adapter + `#kb` staff command | R3 |
| `dashboard.html` | 3 learning cards + approve/auto-draft buttons | R1–R3 |
| D1 tables | `gap_log`, `entry_conf`, `kb_draft` | R1–R3 |

## Data model (D1)
- `gap_log(qkey PK, sample, hits, last_at, source)` — sample is PII-masked (R1)
- `entry_conf(id PK, conf, up, down, at)` — EMA per KB entry (R2)
- `kb_draft(id PK, title, question, answer, keywords, category, status, source, at)` (R3)

## Key decisions & rationale
- **EMA for confidence** (α=0.85): stable, bounded [0,1], no training. Mirrors
  reflex.gist.rs `/feedback` recalibration (local, from outcome labels).
- **Draft→approve, never auto-publish**: R3 safety; graduate-school facts.
- **Markdown emission, not repo write from edge**: keeps provenance; a human
  commits. Edge Workers don't push to the public repo.
- **Service binding (`LLM_PROXY_SVC`)** for worker→worker: a public workers.dev
  fetch between same-account Workers is 404'd at the edge.
- **Daily cron bounded to 3 drafts/run**: caps LLM cost (R4).
- **`STAFF_TOKEN` optional**: zero-config demo, lockable in prod (R5).

## API surface
`POST /gap` · `GET /gaps` · `POST /feedback {entry_id,reward}` · `GET /entry-conf`
· `POST /kb-draft` · `GET /kb-drafts` · `POST /kb-approve {id}` · `POST /kb-autodraft {limit}`

## Testing strategy
- Unit: PII masking, EMA math, advice-vs-factual classification, slug derivation.
- Integration: draft → list → approve → markdown round-trip.
- CI runs the unit tests on every push (see .github/workflows).
