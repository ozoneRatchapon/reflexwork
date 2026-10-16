# Structure Steering — ReflexWork

> Where things live. Load before adding files.

```
.kiro/
  specs/<feature>/{requirements,design,tasks}.md   spec-driven workflow
  steering/{product,tech,structure}.md             always-on context
  hooks/*.json                                      lifecycle hooks
integrations/
  kernel-worker/worker.mjs      routing + learning-loop endpoints + cron
  llm-proxy/worker.mjs          LLM path (local Ollama / Gemini), grounding
  llm-proxy/local-llm-proxy.mjs Node local demo proxy (no cloud)
  llm-proxy/demo-local.sh       one-command local demo launcher
  line-worker/worker.mjs        LINE adapter (+ #kb staff command)
  line-worker/kb-data.mjs       generated KB snapshot for LINE
  corpus-service/worker.mjs     central federated-corpus hub (signals→draft→approve→signed+anchored release)
  _shared/{humanize,rethink,intake,team-adapter,federation}.mjs  shared logic (web+LINE)
submissions/
  build_knowledge_index.py      KB markdown → knowledge-index.json
  ui/knowledge-public/*.md      the KB source (frontmatter + body)
  ui/{chatbot,dashboard,slides}.html  static UI (Pages)
  ui/wasm/                      compiled reflex-wasm
specs/                          original design specs (reflex engine, topology)
docs/                           runbooks, A/B, handover, learning-loop design
tests/                          unit tests (masking, EMA, classifier, slug)
.github/workflows/              CI
```

## Rules
- KB source of truth = `.md` files; the index + `kb-data.mjs` are generated.
- Shared logic goes in `_shared/`; web (inline) and LINE (import) stay in lockstep.
- New feature → add a `.kiro/specs/<feature>/` trio before coding.
