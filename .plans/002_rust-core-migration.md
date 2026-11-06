# 002 — Move the answer logic into one Rust core (incrementally)

Started 2026-11-03 (plan only). **No production change before the pitch (2026-11-07).** The first port lands after it.

## Why (measured, not taste)
- The same logic lives in up to four places and drifts:
  - the inline JS in `submissions/ui/chatbot.html` (1,796 lines);
  - `integrations/_shared/*.mjs` (LINE);
  - `integrations/line-worker/worker.mjs`;
  - `crates/reflex-wasm` (kb_search, which is "lockstep with reflex-wasm::cos_to_score").
- Comments say "kept in lockstep" five times. Lockstep is maintained by hand.
- **Drift that already exists (2026-11-03):** the web uses `kbBody()` (readable points, PR #130), but LINE still uses `_shared/humanize.mjs` (the glued "ขั้นตอนเป็นแบบนี้" opener). The LINE side was not touched.
- Speed is NOT the reason: the browser search already takes ms. The reasons are one implementation for web, LINE and MCP, and Rust tests on every rule.

## Already Rust
- `crates/reflex-kernel` (routing gate, policy, MCP, serve).
- `crates/reflex-wasm`, which exports `route_task`, `kb_search` and `classify_smalltalk` (used by the web page).
- `experiments/dioxus-chatbot-poc` (a UI PoC, not in use).

## Order (each step is a separate PR; each is shippable on its own)
0. [x] (2026-11-03, PR #136) Golden fixtures: a node script dumps the CURRENT JS outputs to `benchmark/golden/*.json`:
   - `answerPoints` and `kbBody` text for all 132 KB entries;
   - `resolveProgramme` for the probe, FAQ and odd question sets;
   - `_pSchedule` and `_pFee` for all 379 programmes;
   - `decideTier` on the probe set.

   This is the contract Rust must match byte for byte.
1. [~] (2026-11-03: Rust `answer::{answer_points, slot_lead}` matches golden 132 + 528 cases natively AND as wasm; NOT wired into web/LINE yet — switch after the pitch) `answer_points` (kbBody text part) and `humanize` replacement → reflex-wasm. The web and the LINE worker (Workers can load the same wasm) both switch, which fixes the LINE drift above.
2. [x] (2026-11-03: `classify_issue`, `is_advice`, `is_english` = golden 969 texts, native + wasm; web and LINE copies checked equal by tests/intake_parity.test.mjs. `classify_smalltalk` already existed in reflex-wasm but is NOT under the golden contract and is not the same scorer as the JS one — decide at the switch) `intake` + `smalltalk` (duplicated in web and _shared) → reflex-wasm.
3. [x] (2026-11-03: `resolve_programme` = golden 2,690 questions × strict+loose, `schedule_table`/`fee_table` = 230/230; native + wasm; NOT wired yet) Programme catalogue: `resolve_programme`, `schedule_table`, `fee_table` → reflex-wasm. The card HTML stays in JS (view only).
4. [x] (2026-11-03: `decide_tier` 91/91, `understand` 1,331/1,331; native + wasm; NOT wired yet) `decide_tier` + `understand` (verification of AI phrases) → reflex-wasm.
5. [ ] Optional: kernel-worker in Rust (`workers-rs`). Only after D1 + cron behaviour has tests.

## Rules for every step
- The JS function becomes a thin call into wasm. The UI (HTML/CSS/DOM) stays JS; no Dioxus rewrite of the UI (no user value, big risk).
- The golden fixtures must match 100% before the switch. Run the 35-question probe, the official FAQ e2e (67/71), journeys and smoke ×4.
- Keep a JS fallback while the wasm loads, the same way `search()` falls back to `_jsSearch` today.
- `.rs` files stay under 1,024 lines; logic goes in `types.rs` / modules; use `match` over `if` chains (global rules).

## Not decided
- Whether LINE loads the wasm or calls a Rust worker over HTTP. Measure cold start on Workers first.


## Port notes (2026-11-03)
- **Regexes** are not retyped: `scripts/gen_rust_pattern_sources.mjs` writes `crates/reflex-wasm/src/resolve/patterns_src.rs` from chatbot.html (source + flags). `tests/rust_patterns_sync.test.mjs` fails when they drift. Rust only translates `\s`/`\S` (the ECMAScript whitespace set) when compiling.
- **`regex-lite`, not `regex`:** with `regex` the wasm was 1.2 MB (609 KB with trimmed features); with `regex-lite` it is 285 KB after `wasm-opt -Oz` (gzip 117 KB; the deployed wasm is 133 KB / gzip 56 KB). Same golden results.
- **`_P_LEAD` lookaheads** (not supported by the engine) become capture groups; the match is cut where the lookahead would stop. `ต่อ(?=โท|เอก)` cannot fire (`ต่อโท|ต่อเอก` are stripped by `_P_DEGREE` first), so its mutant is equivalent.
- **Known exotic divergence:** case-insensitive matching folds ASCII only; JS non-unicode `/i` does the same except for a few non-ASCII letters (e.g. the Kelvin sign). Nobody types those, and Thai has no case.
- **Golden was widened** (resolve 527 → 2,690 questions, plus understand 1,331 cases) after mutation tests showed untested rules: lookahead, level, intl/special, code, alias, 12-programme cap, loose window, whitespace set. 24 mutations of the Rust code are now caught; one is equivalent (above).
- **Before switching the page:** build with `cargo build --release --target wasm32-unknown-unknown` + `wasm-bindgen` + `wasm-opt -Oz`; replace JS calls by wasm calls behind the existing JS fallback; run the 35-question probe, FAQ e2e (67/71), journeys, smoke ×4.
- **Strict null:** wasm `Option::None` used to come out as `undefined`; every export now goes through `to_js` (null, also inside objects), as the page's JS returns it. `scripts/wasm_golden_check.mjs <pkg>` checks a BUILT package against all six golden files (strictly) and exits 1 on any difference. Run it on the artefact that would be deployed.
- **Shared compiler:** `crates/reflex-wasm/src/re.rs` translates JS regex syntax (`\s`, `\S`, `\d`, `\b`, and `.` = not any of the four line terminators); the `patterns_src.rs` of `resolve/` and `intake/` are both generated from chatbot.html.
- **Status: every pure function is ported and verified** (answer_points, slot_lead, decide_tier, schedule_table, fee_table, resolve_programme, understand, classify_issue, is_advice, is_english). **Left: the switch.** Plan: one PR that builds the wasm (cargo + wasm-bindgen + wasm-opt), replaces the JS calls by wasm calls behind the existing JS fallback, and for LINE imports the same package; then the 35-question probe, FAQ e2e (67/71), journeys, smoke x4, `wasm_golden_check` on the deployed file.
