# Golden contract (Rust port, step 0)

Frozen **inputs + current JS outputs** of the pure answer logic in `submissions/ui/chatbot.html`. A Rust implementation in `crates/reflex-wasm` must reproduce these files exactly before the page switches to it (`.plans/002_rust-core-migration.md`).

| file | function(s) | cases |
|---|---|---|
| `answer_points.json` | `answerPoints`, `slotLead` (4 question kinds) | 132 KB entries |
| `schedule_fee.json` | `_pSchedule`, `_pFee` | 230 programmes with an announcement |
| `resolve.json` | `resolveProgramme` (strict + loose) over a frozen 379-programme catalogue | 2,690 questions (probe, official FAQ, odd set, programme questions, edge families for lookahead / level / intl / code / alias / 12-cap / whitespace) |
| `decide_tier.json` | `decideTier` (action, stage, reason) | 91 gate × score grids |
| `understand.json` | `understand` (search results of each phrase frozen in the case) | 1,331 phrase lists |
| `intake.json` | `classifyIssue`, `isAdvice`, `isEnglish` | 969 texts |

- One case per line, so diffs are reviewable and a Rust test can read them line by line.
- `node scripts/golden_dump.mjs --check` (and `tests/golden_contract.test.mjs`) re-runs the JS on the frozen inputs. Any difference fails the check. Negative control: removing one split word or moving one gate threshold by 0.01 fails it.
- **Changed the logic on purpose?** Run `node scripts/golden_dump.mjs`, review the diff and commit it. The diff is the change in behaviour the Rust side must follow.
- Because the inputs are frozen, the weekly catalogue refresh and KB rebuilds do not touch these files.
- **Who reads these files:** `cargo test -p reflex-wasm` (Rust, native), `node scripts/wasm_golden_check.mjs submissions/ui/wasm` (the committed wasm artefact, strict: `null` is not `undefined`) and `tests/engine_switch.test.mjs` (CI). The same questions are compared end to end on the real page by `benchmark/engine/engine_ab.mjs`.
