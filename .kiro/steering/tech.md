# Tech Steering — ReflexWork

> The stack and the conventions. Load before writing code.

## Stack
- **Kernel**: Rust → WASM (`reflex-wasm`, in-browser) + a JS port
  (`integrations/kernel-worker`) for the edge. sigmoid gate, BLAKE3 proof.
- **Edge**: Cloudflare Workers (kernel, llm-proxy, line-worker) + D1 (SQLite)
  + Pages (static UI: chatbot, dashboard, slides).
- **LLM path**: `_shared/team-adapter.mjs` — providers `gemini` (proxy),
  `ollama` (local), `gradmahidol` (other team), `echo` (offline test).
- **Local AI**: Ollama; model `scb10x/llama3.2-typhoon2-3b-instruct`
  (Thai-tuned; the gemma3-12b/4b Typhoon builds hit a tool_calls template bug
  on Ollama 0.32.13). Exposed to the edge via ngrok / Cloudflare Tunnel.
- **KB**: markdown in `submissions/ui/knowledge-public/` → built into
  `knowledge-index.json` (gitignored, generated) by `build_knowledge_index.py`.

## Conventions
- Facts from KB only; LLM rephrases, never invents (grounded hybrid uses a
  strict "ห้ามแต่งนอก KB" system prompt).
- Deterministic everywhere the proof depends on it (same input → same output).
- `snake_case`/`match`/early returns in Rust; keep `.rs` under 1024 lines.
- Stage named files only; never `git add -A`. Conventional commit subjects.
- Push to feature branches, open PRs; never push to `main` directly.
- Workers deploy with `npx wrangler deploy`; Pages with
  `npx wrangler pages deploy ui --project-name=reflexwork`.
- Secrets via `wrangler secret put` — never in code/git (GEMINI_API_KEY,
  OLLAMA_URL, STAFF_TOKEN, LINE_* ).

## Worker→worker calls
Use a **service binding** (e.g. `LLM_PROXY_SVC`), not a public workers.dev fetch
— the latter is 404'd at the edge between same-account Workers.
