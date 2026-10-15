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
