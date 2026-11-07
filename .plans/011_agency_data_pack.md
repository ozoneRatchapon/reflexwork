# 011 - Agency data pack: move the domain out of the engine (2026-11-08)

Goal: a second agency (a hospital, expected) is a data pack, not a code change. Rust keeps the generic engine (search, gate,
understand, routing order); everything that says "graduate school" moves into the pack. Gate at every step: `route_golden.mjs --check`
0 differences, `wasm_golden_check` 0 differences, `cargo test` green, `chat_e2e` green.

## What is education-specific today (inventory, 2026-11-08)
Rust `reflex-wasm` (education words per file, from `rg`): route/patterns_src.rs 20, route/term_year.rs 5 (+ 18 in the term/year
pattern), route/scope.rs 6 (round and year words), resolve/patterns_src.rs 16 (programme, level, faculty words), route/stuck_src.rs 10
(student problem areas), route/branches.rs 5, catalogue/schedule.rs 5, lib.rs 5, intake/patterns_src.rs 2, and smaller hits in ~10 other files.
Page `chatbot.html`: the `DEFAULT_AGENCY` / `AGENCY` config already holds URLs, contacts and wording (education values), and the branch
order is still JS (route switch is `take()`, default rust).

## Target shape
- `agency.json` (per deployment) gains a `vocab` block: round words, year/term words, fee words, free-fee premise words, level words
  (ปริญญาโท etc.), programme/faculty words, problem-area words, wellbeing and intake contacts.
- The Rust patterns are built from `vocab` at load (Router::new takes it), not compiled in. The compiled-in defaults become the
  graduate-school pack, so the current golden stays identical.
- Golden per pack: each agency has its own `benchmark/golden/<agency>/` recorded from its own page (never reuse the graduate school's).

## Steps (each one is a commit with the gate above)
1. Move the graduate-school values out of `route/patterns_src.rs` into a `GRAD_VOCAB` struct in one file; `Router` takes it (default = GRAD_VOCAB). No behaviour change.
2. `route/term_year.rs` and `route/scope.rs` read round/year/term words from the struct.
3. `route/stuck_src.rs` and `intake/patterns_src.rs` (problem areas, contacts) read from the struct.
4. `resolve/patterns_src.rs` (programme/level/faculty) reads from the struct; catalogue fields stay as data.
5. `chatbot.html`: `agency.json` `vocab` is passed to `new WASM.Router(...)` and the page's own regex copies are removed (Rust is the source of truth; scripts/gen_rust_pattern_sources.mjs changes accordingly).
6. A second pack (a stub hospital pack with invented test data, clearly marked) builds and passes its own smoke test; only then the real hospital data.

## Hospital-specific risks (decide before step 6)
- Health data: no patient records, no diagnoses, no appointment data in the KB or the gap log. The gap log stores question text: the scrubber must be checked for health terms.
- The wellbeing branch (crisis keywords and the 1669 number) is a clinical boundary in a hospital: the wording and the escalation path need the hospital's own clinicians.
- Personal-data boundary (`personal` branch) and the account/IT intake need the hospital's own IT and PDPA owner.
- Thai medical terms are not in the lexicon yet: each term list needs a reviewer.

## Owner inputs needed
- Which hospital, and which public information may be published (KB sources, URLs).
- Confirmation that no patient data enters the pack, the gap log or the LLM.
- The hospital's contact points (IT, staff line, emergency wording).
