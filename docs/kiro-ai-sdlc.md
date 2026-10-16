# How ReflexWork used Kiro (AI-SDLC)

> Honest account of which Kiro features drove this build — what we used from the
> start, and what we formalized once we adopted the spec-driven workflow.

## 1. Spec-driven development (`.kiro/specs/`)
We adopted Kiro's **requirements → design → tasks** workflow for the
self-improving KB learning loop:
- `.kiro/specs/learning-loop/requirements.md` — EARS-style acceptance criteria
  (R1–R5): gap capture, entry confidence, draft→approve, daily run, security.
- `.kiro/specs/learning-loop/design.md` — architecture, data model, key
  decisions + rationale, API surface, test strategy.
- `.kiro/specs/learning-loop/tasks.md` — task breakdown with status checkboxes
  mapped to the requirements, so progress is auditable.

The earlier reflex-engine specs live in `specs/` (topology, engine, anchor,
MCP interface) — the original design docs this project started from.

> Transparency: the kernel/NLG/local-AI work earlier in the project was built
> conversationally; the learning-loop feature is where we ran the full
> spec-first loop. Going forward, new features start with a `.kiro/specs/<f>/`
> trio (see steering/structure.md rule).

## 2. Steering (`.kiro/steering/`)
Always-on context so every agent session shares the same ground rules:
- `product.md` — what ReflexWork IS + the 5 hard rules (facts from KB, abstain
  over guess, PDPA, no auto-publish, no retrain).
- `tech.md` — stack + conventions (snake_case Rust, named-file staging,
  feature-branch PRs, service bindings for worker→worker).
- `structure.md` — where files live + "new feature → spec trio first".

## 3. Hooks (`.kiro/hooks/`)
Lifecycle hooks already in the repo:
- `on-proof-ready.json` — fires when a BLAKE3 proof is produced.
- `on-task-created.json` — fires on task creation.
Kiro hooks run a command at trigger points (`agentSpawn`, `preToolUse`,
`postToolUse`, `stop`, `userPromptSubmit`) with JSON on stdin; a `preToolUse`
hook can BLOCK a tool with exit code 2. We use this pattern for validation/
telemetry around the proof + task lifecycle.

## 4. Agent config (`.kiro/agents/`, `.kiro/settings/`)
Agent behavior, allowed tools, resources and MCP servers are declared in
`.kiro/` config (hot-reloaded without restart). This is how the project pins
which tools/paths an agent may touch.

## 5. CI as the gate (`.github/workflows/ci.yml`)
Kiro CLI returns standard exit codes (0 success / 1 failure / 2 arg error) for
headless/CI use. Our CI runs the pure-logic unit tests + `node --check` on every
Worker on each push — the spec's "testing strategy" made executable.

## Kiro commands worth using next
- `/plan` (or Shift+Tab) — the **Planning Agent**: turns an idea into
  requirements + a task breakdown before any file is written (read-only until
  you approve + hand off to execution). This is the canonical way to start the
  NEXT feature spec-first.
- `/hooks` — list configured hooks and their status.
- `/spawn <task>` — run an independent task in a parallel session.

## Scorecard (honest)
| Kiro practice | status |
|---|---|
| spec trio (requirements/design/tasks) | ✅ learning-loop; adopt for all new features |
| steering docs | ✅ product/tech/structure |
| hooks | ✅ 2 lifecycle hooks in repo |
| agent config / settings | ✅ in `.kiro/` |
| CI gate | ✅ tests + syntax check on push |
| Planning Agent `/plan` for new work | ▶ adopt going forward |
