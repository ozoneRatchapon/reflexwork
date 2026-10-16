# ReflexWork — LINE adapter (proof-of-concept)

ReflexWork is a **screening layer**, not a chatbot replacement. It sits in
front of any team's existing system (LINE bot, web chat, internal API) and
decides — in microseconds, with zero token cost on the fast path — whether a
message can be answered from the knowledge base or genuinely needs the LLM.

```
LINE user ──▶ adapter.mjs ──▶ POST /route  (Reflex Kernel decides)
                                 ├─ FastPath → answer from KB      (0 token)
                                 └─ LLM path → forward to team LLM  (pay only here)
```

Every reply carries the kernel's decision and a reproducible **BLAKE3 proof**,
so each answer is auditable (re-run the same input → same proof).

## Run the PoC

Start the kernel API first:

```bash
cargo build --release --bin reflex-serve
PORT=8787 ./target/release/reflex-serve      # binds 127.0.0.1 only
```

Then the adapter (PoC log mode — no LINE credentials needed):

```bash
REFLEX_URL=http://127.0.0.1:8787 node integrations/line/adapter.mjs
```

With real LINE credentials, set `LINE_CHANNEL_ACCESS_TOKEN` and
`LINE_CHANNEL_SECRET`, expose `/webhook` publicly (e.g. a tunnel), and point the
LINE Messaging API webhook at it.

## What a real deployment plugs in

The PoC is runnable but deliberately stubs two spots so no secrets or paid
calls are required:

| Spot in `adapter.mjs` | Replace with |
|---|---|
| `answerFromKB()`  | the team's knowledge base / vector store |
| `answerFromLLM()` | the team's own LLM (Gemini / Bedrock / OpenRouter) |

Signature verification is implemented (HMAC-SHA256); it is skipped only when
`LINE_CHANNEL_SECRET` is unset so the PoC runs offline.

## Status

Reference PoC demonstrating the integration shape. Not production-hardened:
no rate limiting, no per-user conversation state, no retry/queue. Those are the
remaining work before a real LINE deployment.

---

## Production path: `../_shared/team-adapter.mjs`

The live edge worker (`../line-worker/worker.mjs`) answers FastPath from the
embedded KB and sends only LLM-path questions through **`team-adapter.mjs`**.
That module is the single place where ReflexWork forwards to another team's
backend — it is **provider-agnostic** and selected entirely by env, so plugging
in another team's API (e.g. `gradmahidol-ai`) is a **secrets-only** change with
no code edit.

```
kernel.route ─ LLM path ─▶ askTeam(text, env) ─┬─ provider=gemini      → our proxy (default)
                                               ├─ provider=gradmahidol → the other team's API
                                               └─ provider=echo        → offline demo/test
```

### Point the LLM path at the other team's API

Set these as Worker secrets on `line-worker` (never in git/chat):

```bash
cd integrations/line-worker
echo "gradmahidol"                   | npx wrangler secret put TEAM_API_PROVIDER
echo "https://<their-host>/ask"      | npx wrangler secret put TEAM_API_URL
echo "<bearer token they issue us>"  | npx wrangler secret put TEAM_API_KEY   # optional
npx wrangler deploy
```

That's it — FastPath still answers from our KB at 0 token; only the ~20% of
questions the kernel routes to the LLM now hit the other team's system.

### If their contract differs

The adapter tolerates common response field names (`answer` / `reply` / `text`
/ `message` / OpenAI-style `choices[0].message.content`). If their request or
response shape is unusual, edit **only** the `gradmahidol` entry's `toRequest`
/ `fromResponse` in `team-adapter.mjs` — the transport, timeout, auth header,
and graceful-degrade logic never change.

### Safety behavior

`askTeam` never throws: a timeout (`TEAM_API_TIMEOUT_MS`, default 8s), network
error, non-200, or a "quota/unavailable" marker all return `{ ok:false }`, and
the LINE worker then shows the FastPath-redirect fallback instead of a raw
error. So a down/throttled upstream can never break the bot — it degrades to
"ask something in the manual".

> ⚠️ The other team's **knowledge files** remain `pending owner approval` and
> are not shipped. This adapter forwards *live questions* to their API with
> their consent + token; it does not copy or publish their data.

