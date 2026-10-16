# ReflexWork 🦀

**A screening layer in front of an LLM.** A deterministic Rust/WASM "Reflex
Kernel" decides, per message, whether a question can be answered in
**microseconds for 0 token** (FastPath from a verified knowledge base) or must
escalate. Every decision carries a reproducible **BLAKE3 proof**. Built for a
graduate-school help chatbot (Mahidol), but the kernel is domain-agnostic.

> Same idea as "System One" models (TypeSafe Jev, reflex.gist.rs): fast,
> structured, **can't hallucinate facts** — the facts come from the KB, the
> model only rephrases.

## Why
LLM chatbots answer every question with a paid, non-reproducible model call.
~80% of real questions are repeat/FAQ. ReflexWork routes those to a free,
auditable FastPath and sends only the hard ~20% to an LLM — cutting token cost
60–80% while staying verifiable (BLAKE3) and PDPA-friendly (local AI option,
no PII leaves the box).

## The 4-way decision
| question | route | result |
|---|---|---|
| factual ("how many days?") | FastPath (KB) | 0 token, exact |
| advice ("how do I plan?") | grounded hybrid (KB + LLM rephrase) | fluent, no made-up facts |
| off-corpus / low confidence | abstain → staff | honest, logged as a gap |
| personal ("my login fails") | intake → staff | collects fields first |

## Quickstart (local demo, 0 token, no cloud)
```bash
# needs: node 20+, python3, ollama (https://ollama.com)
git clone https://github.com/ozoneRatchapon/reflexwork && cd reflexwork
python3 submissions/build_knowledge_index.py        # build the KB index
./integrations/llm-proxy/demo-local.sh              # ollama + proxy + UI
# open the printed URL:
#   http://127.0.0.1:5173/chatbot.html?api=http://127.0.0.1:8787
./integrations/llm-proxy/demo-local.sh stop         # tear down
```
FAQ → FastPath from KB (0 token). Advice/open-ended → local Typhoon (0 token,
nothing leaves your machine).

## Tests
```bash
node tests/learning_loop.test.mjs        # pure-logic unit tests
```
CI runs these + Worker syntax checks on every push (`.github/workflows/ci.yml`).

## Deploy (Cloudflare)
```bash
cd integrations/kernel-worker && npx wrangler deploy
cd ../llm-proxy && npx wrangler deploy
cd ../line-worker && npx wrangler deploy
cd ../../submissions && npx wrangler pages deploy ui --project-name=reflexwork
```
Secrets via `wrangler secret put` (GEMINI_API_KEY, OLLAMA_URL, STAFF_TOKEN,
LINE_*). See `docs/` for runbooks.

## Self-improving KB (learning loop)
The KB grows from real usage: unanswered questions become a PII-masked backlog,
👎 decays a weak entry's confidence, and the top gaps get AI-drafted candidate
answers daily — a human approves with one click. See
`.kiro/specs/learning-loop/` and `docs/learning-loop-design.md`.

## How it was built
Spec-driven with Kiro — see `docs/kiro-ai-sdlc.md` and
`.kiro/specs/learning-loop/{requirements,design,tasks}.md`.

## License
MIT — see [LICENSE](LICENSE).
