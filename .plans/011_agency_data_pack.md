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

## Status note (2026-11-08, step 1 scoping)
- Baseline before any change: `cargo test -p reflex-wasm` green (all suites).
- Step 1 is not a rename. The route regexes are `pub const Re` in `route/patterns_src.rs`, and each is compiled into a process-global
  `OnceLock<Regex>` at about 40 sites across ~10 modules (`aspect`, `branches`, `dates`, `near`, `programme`, `scope`, `stuck`,
  `term_year`, `text`, `topic`). A `GRAD_VOCAB` value cannot feed `const` strings without a macro crate, so the vocabulary has to be
  read at runtime.
- Design for step 1 (not started): one `Patterns` struct built from `Vocab` (`Patterns::build(&Vocab)`); the `Vocab` fields hold the
  current `src` strings verbatim; `GRAD_VOCAB` is the default. `Ctx` carries `&Patterns` so the OnceLock sites are replaced. `Router::new`
  gets an optional vocab argument, so the page keeps working until step 5.
- Why it was not started in this pass: about 40 OnceLock sites plus Ctx threading in one change is too large to finish and gate safely
  in one pass. Start it in a session of its own, one module per commit, running `route_golden --check` and `cargo test -p reflex-wasm` after each.

## Reference: CQL and CDSS (lecture slides 10-16, 20; recorded 2026-11-08)
- CQL is the HL7 standard language for three things: clinical decision support rules, clinical quality measurement, and clinical knowledge
  that people can read and machines can run. Manual: https://cql.hl7.org/ . Reference engine: https://cql-runner.dataphoria.org/ (the hosted
  runner from the DBCG/cql_runner project, which is not licensed on GitHub; do not copy code from it).
- CQL runs on data mapped to FHIR (`Patient`, `Observation`, `MedicationRequest`). Large data needs search-parameter and index tuning
  (hundreds of thousands to millions of records).
- Rule-based CDSS = If-Then rules in a knowledge base, an inference engine, working memory and patient data. The lecture's example rule is
  IF systolic BP > 140 AND diastolic BP > 90 THEN alert. AI-based CDSS is the other type (machine learning).
- Relevance to plan 011: only if the hospital pack needs clinical rules or quality measures. This does not touch the graduate-school
  pack. Any clinical rule or wording needs the hospital's clinicians (see "Hospital-specific risks" above).

## Step 1 done (2026-11-08, gate result `benchmark/gates/002_graduate-school_2026-11-08.md`)
- The 42 route patterns moved from `route/patterns_src.rs` (deleted) to `packs/graduate-school/vocab.json`, checked exact against the old consts.
- `route/vocab.rs` loads the pack: the embedded graduate-school default, or a pack passed as the third argument of `Router::new`
  (the page still passes two arguments and gets the default). Install is once per process, before any route call.
- Gates: route_golden PASS, wasm_golden PASS, cargo test PASS, chat_e2e PASS. Gate 4 SKIPPED (no synth yet). Gate 5 FAIL, 217 hits
  (was 267): the rest are in `resolve`, `catalogue`, `answer`, `lib.rs`. They are steps 2 to 4 of this plan.
- Not committed.
- Slide 30 (CQL strengths): human-readable (clinicians can read and write it), machine-executable, used together with FHIR to pull patient
  data, reusable across systems, and standard-based (HL7).

## Step 2 done (2026-11-08, gate result `benchmark/gates/003_graduate-school_2026-11-08.md`)
- `route/term_year.rs` and `route/scope.rs`: the 15 patterns and the words they write or compare (term names, academic year word,
  fee word, round word, admissions category) now come from `vocab.json` (`words` object). Each pattern was checked byte-exact against HEAD.
- Gates 1, 2, 3a, 3b PASS. Gate 4 SKIPPED. Gate 5 FAIL with 200 hits (was 217 after step 1, 267 before).
- Committed in f273283 (steps 1-2) and 8bf3cf8 (status docs).

## Step 3 done, stuck part (2026-11-08, commit 97aaa73)
- The "ติดปัญหา" branch vocabulary (`stuck_w`, `stuck_fill`, `stuck_cats`: 5 areas with topic, title and seed phrases) moved from
  `route/stuck_src.rs` (deleted) into `vocab.json`. Seed counts per area match the old file (3, 5, 6, 4, 4).
- Decision: the `intake` patterns (`intake/patterns_src.rs`) stay GENERATED from `chatbot.html`. `tests/rust_patterns_sync.test.mjs`
  is the only guard that the Rust copy matches the page's `_ISSUE_CATS` and `_NOT_PERSONAL`; moving them to `vocab.json` now would drop
  that guard while the page still has its own copy. They move in step 5, when the page reads `vocab.json` and the page copy goes away.
- Gates: `cargo test -p reflex-wasm` exit 0; `route_golden.mjs --check` 2271 checked, 0 differences; shadow 5112 same, 0 differ.
- Not run: `chat_e2e` (page untouched in this step).
