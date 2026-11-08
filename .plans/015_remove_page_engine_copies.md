# 015 - Remove the page's regex copies and the JS fallback (plan 011 step 5, part 2) (2026-11-08)

Owner decision (2026-11-08): delete the JS fallback. `?route=js` and `?engine=js` stop working. Rust is the only engine.

Goal: one source of truth for the route, intake and resolve regexes (`packs/graduate-school/vocab.json` and the Rust crate), no duplicate
copies in `submissions/ui/chatbot.html`. Each step is one commit and runs the gate set (route_golden, wasm_golden, cargo test, chat_e2e).

## Inventory (2026-11-08)
- `chatbot.html` 2818 lines. About 12 `ENG.impl` / `_engine(` call sites bind a JS twin to a Rust call (`classifyIssue`, `isAdvice`,
  `isEnglish`, `_pFee`, `_pScheduleData`, `decideTier`, `understand`, `resolveProgramme`, `answerPoints`, `slotLead`, ...).
- Page regex constants: `_P_*` (about 40 lines, programme/resolve), `_ISSUE_CATS`, `_NOT_PERSONAL`, `_ADVICE`, `_FACTUAL`, `_STUCK_*`,
  `_PERS_*`, `_TERMS`, `_TH_*`, `_TIME_*`, `_SNAPSHOT_RE` and others. Some are used only by the JS twins, some by page logic that is not
  part of the route (dates, table rendering).
- Files that read these from the page (they break when the copies go):
  - Tests: `tests/short_input`, `english_programme`, `programme_resolve`, `fee_premise`, `intake_parity`, `stuck_intent`,
    `tuition_scope`, `level_only`
  - Scripts: `scripts/dump_route_text_golden.mjs`, `scripts/lib/chatbot_fns.mjs`, `scripts/gen_rust_pattern_sources.mjs`
  - Also reading the page by name: about 60 more files under `tests/` and `benchmark/` (most only check that a page string exists; each
    must be checked before deleting)
- `tests/engine_switch.test.mjs` and `benchmark/engine/engine_ab.mjs` test the JS/Rust switch and must be removed or rewritten.
- `tests/rust_patterns_sync.test.mjs` guards `resolve/patterns_src.rs` and `intake/patterns_src.rs` against `chatbot.html`. Once the copies are
  gone the guard has no source; it moves to `vocab.json` (resolve, intake) or is removed.

## Steps
1. DONE (2026-11-08, revised): the golden dumper is the JS oracle that wrote `route_text.json`, `scope.json`, `dated_picks.json`. The committed
   golden files are the contract now (Rust tests read them), so they are frozen and not regenerated from Rust. The dumper takes an optional
   `chatbot.html` path: after step 5 it regenerates from a snapshot of the last commit that still has the JS copies
   (`git show <commit>:submissions/ui/chatbot.html`). Helpers in `scripts/lib/chatbot_fns.mjs` already take the HTML as a parameter.
   Caveat found: a run on the current tree pulls in the uncommitted `benchmark/golden/route.json` additions (226 new lines in
   `route_text.json` and `scope.json`), so those two files were restored from HEAD and not committed.
2. Stuck and intake copies: `_STUCK_*`, `_ISSUE_CATS`, `_NOT_PERSONAL`, `_ADVICE`, `_FACTUAL` removed from the page. Tests `stuck_intent`,
   `intake_parity` rewritten to check the Rust output.
3. Resolve copies: `_P_*` and the `_P_TOPIC/_P_ASK/_P_LEVEL` tables removed. `rust_patterns_sync` guard moved to `vocab.json`.
   Tests `programme_resolve`, `english_programme`, `level_only`, `fee_premise`, `tuition_scope`, `short_input` rewritten.
4. Route copies: `_PERS_*`, `_TIME_*`, `_TERMS`, etc. removed. `decide` runs only in Rust. `take()` and `RUST_TURN` removed; `shadow` removed.
5. JS twins: `_engine(...)` wrappers and the JS function bodies removed. `ENGINE_DEFAULT`, `?engine=` and `?route=` parsing removed.
   The page stops with a visible message if the wasm lacks an export (the wasm is rebuilt with the page).
6. Remaining `chatbot.html` tests (about 60 files): check each one, rewrite or delete the ones that only assert a page string.

## Risks
- Golden files and the engine A/B results (`benchmark/engine/results`) describe the JS path. They stay as history; they are not regenerated.
- A stale cached wasm in a browser has no fallback after step 5. Mitigation: the page shows "reload" when a Rust export is missing.
- Scale: about 70 files reference the page. This plan is several sessions, not one. Each step is its own commit.

## Status (2026-11-09)
- Steps 1, 2, 3 done (3 in two commits: 3a c73b199, 3b feec6c8). Step 4a (a3fe732), 4b (db94144), 4c (15ef269) and 5 done. Next: step 6.

## Step 2 done (intake part, 2026-11-08)
- The intake patterns (`_ISSUE_CATS`, `_NOT_PERSONAL`, `_ADVICE`, `_FACTUAL`) moved from the page into `vocab.json` (`intake_issues`,
  `not_personal`, `advice`, `factual`). `intake/patterns_src.rs` deleted; the generator no longer writes intake (resolve still generated).
- The page's `classifyIssue`, `isAdvice`, `isEnglish` are wrappers of the wasm port. Their `_engine` lines are gone.
- Tests moved off the page copies: `intake_parity` (web checked by wasm golden), `stuck_intent` and `english_programme` (LINE module),
  `engine_switch` (seven functions in the switch). `golden_contract` passes through `loadIntake` (LINE module).
- Gates: cargo test exit 0; wasm golden 0 differences (intake 985); route golden 2271 / shadow 5112, 0 differences; chat e2e 56/56.
- Not in this step, failing at HEAD before the change (not caused by it): chat_keep, counters_turns, fee_premise, not_found_gate,
  short_input, tuition_scope, level_only, engine_switch (one check).
- `scripts/dump_route_text_golden.mjs` and `golden_dump.mjs` need a chatbot.html snapshot from before this step (see the dumper's header).

## Step 1, partial (2026-11-08): Rust-only route check for single questions
- `benchmark/golden/route_rust_check.mjs` runs the wasm the page ships over the 2221 single-question entries of `route.json`, with no browser.
- The golden does not store the page's AI_OFF flag, and it changed during the recording run. A question passes when the Rust route matches
  with AI_OFF on or off; catalogue_not_ready passes with progState 'loading'. Result: 2221/2221 (2162 match both settings, 59 one setting).
- The rule is lenient: a change that flips an advice route between kb_act and advice_* can pass in the 59. The exact check stays in the
  browser (route_golden.mjs, shadow mode) until the flag is recorded per entry.
- Not done: recording `ai_off` per entry. That changes `route_golden.mjs` and `route.json`, which have uncommitted edits that are not from
  this work; owner decision needed first.
- Session and pin entries (24 + 26) still need the page's state carry-over; they stay in shadow mode.

## Step 1 exact (2026-11-09)
- `route_golden.mjs` records `ai_off` on every entry; `route.json` re-recorded (routes identical to before, 2150 true / 118 false).
- `route_rust_check.mjs` compares each single question with its own `ai_off`: 2221/2221, 0 differ (commit e48a188).
- Pins: only chooser questions (topic_picks, disambiguate) are probed; 23 pins recorded, 3 stale pins dropped (a3db2f0).

## Step 3 done (2026-11-09)
- 3a (c73b199): resolve regexes moved to `vocab.json` (`resolve`); `resolve/patterns_src.rs`, `scripts/gen_rust_pattern_sources.mjs`
  and `tests/rust_patterns_sync.test.mjs` removed. The page's `resolveProgramme` is a Rust wrapper; its JS body and unused helpers are gone.
- 3b (feec6c8): fee_premise, tuition_scope, short_input, level_only, not_found_gate check Rust routes (`scripts/lib/rust_route.mjs`).
  Shipped wasm rebuilt.
- Still on the page (used by page logic, not the resolver): `_P_TOPIC`, `_P_LEVEL`, `_pLevel`, `_P_OTHER`, `followUpAspect`,
  `_P_ASPECT`, `_P_TUITION`, `_P_NONTUITION`, `_P_FREEQ`, `_P_FREESTUDY`, `_P_FINDQ`. They go with step 4 (the route copies).
- Gates: cargo test exit 0; route_golden 2268 / shadow 4629, 0 differences; route_rust_check 2221/2221; chat_e2e 56/56.
- Still failing, not from this plan: chat_keep, counters_turns (page-text checks, failing before step 2).

## Step 4 (2026-11-09)
- 4a (a3fe732): `?route=js` removed; routes always come from Rust.
- 4b: the 28 route sites in `_askCore` ask `take(name)` only; the JS conditions are gone. When the Rust router cannot run (an old cached
  wasm without `WASM.Router`, or it threw) the page shows a reload message (`VOICE.routerReload`, route `router_unavailable`) instead of
  guessing; `tests/chat_e2e` checks it with a stamped page (`/chatbot.stale.html`).
  Removed as unused: `isTuitionQuestion`, `_P_TUITION`, `_P_NONTUITION`, `_P_FREEQ`, `_P_FREESTUDY`, `_P_CAREER`, `isCareerQuestion`,
  `_P_ACK`, `isNotAQuestion`, `isOtherScript`, `isGenericFeeQuestion`, `isOverviewQuestion`, the page's `isAdvice` wrapper.
  Tests moved to Rust routes (`scripts/lib/rust_route.mjs`, `routeOf(q, stateOverride)`): overview, followup_scope, personal_boundary,
  agency_pack, ui_guards, chat_keep, counters_turns (the last two were failing before step 2 and pass now).
  `benchmark/compare/programme_names.mjs` passes the shipped wasm (broken by 3a; `pitch_claims` runs it and passes again).
- Plan revised: `take(name)` stays as a one-line name check, and shadow mode stays: `shadowBegin` is where the route is computed, and
  `route_golden.mjs` reads `window.__shadow` to catch a body that falls through after Rust chose its route.
- 4c: the router returns what each route's view needs. New wasm method `Router.decision(q, state, rewrite)` ->
  `{route, personal, stuck: {key, picks, areas}, programme, aspect, timeIntent, studyIntent}` (`route/detail.rs`, computed from the same
  prepared question and state as the route); `Router.decide` still returns the name only. `route/programme.rs` `programme_match` returns the
  resolution (English pre-pass topic included); `branches.rs` `staff_first` is shared. The page reads `RUST_DETAIL` (set beside `RUST_TURN`);
  `_progView` maps a resolution's codes to rows. Removed from the page: `personalAsk` + `_PERS_*`, `stuckTopic`, `stuckPicks`, `_STUCK_W`,
  `_STUCK_FILL`, `_STUCK_CATS` (display-only `_STUCK_VIEW` kept: chip / name / question per area key), `timeIntent` + `_TIME_*`,
  `followUpAspect` + `_P_ASPECT` (label table `_P_ASPECT_TH` kept), `hasStudyIntent`, `_P_NOTSTUDY`, `isFinderQuestion`, `_P_FINDQ`,
  `isLevelOnlyQuestion`, `_P_LEVEL_FILL`, `englishProgrammeAsk`, `_P_EN_ASK`, `_P_EN_FILL`, `_P_TOPIC`, `_P_OTHER`, the `staffFirst` local.
  Parity before removal: the page ran both (JS value vs Rust detail per route) through route_golden: 4629 shadow same, 0 differ.
  Tests: the readers' hand cases moved to `crates/reflex-wasm/tests/route_predicates.rs`; personal_boundary, followup_scope,
  english_programme, stuck_intent, programme_resolve check the router (`decisionOf` in `scripts/lib/rust_route.mjs`); date_awareness and
  chat_robust drop the moved cases. Still JS on the page (step 5/6): `datedPicks`, `nearSpelling`, `_pLevel` / `_P_LEVEL` (finder facets).
  `scripts/dump_route_text_golden.mjs` needs a pre-4c chatbot.html snapshot (as its header says).
- Still failing, for step 5: `engine_switch` (checks the `_engine` switch that step 5 removes). `benchmark/engine/engine_micro.mjs`
  reads `ENG.impl.isAdvice`, which has not existed since step 2.
- Gates: see the commit message.

## Step 5 done (2026-11-09)
- Page: the engine switch is gone (`ENGINE_DEFAULT`, `?engine=`, `_engine()`, `ENG`, `window.__eng`, `data-engine`). `answerPoints`, `slotLead`,
  `decideTier`, `understand`, `_pFee`, `_pScheduleData` are one-line Rust calls; their JS bodies and helpers (`_SPLIT_BEFORE`, `_sentences`,
  `_joinLabels`, `_unmark`, `_LABEL_*`, `_SLOTS`, `_BAND`) are removed. The search has no JS fallback (`_jsSearch`, `_jsGramSet`,
  `_cosToScore`, `_stripQ`, `_QFILL` removed); `_staffSupersede` re-scores with the new wasm export `cos_to_score` (lib.rs `kb_row_score`).
- `_WASM_NEEDS` (13 exports): `load()` throws when one is missing, so an old cached wasm gets the boot error with its retry button.
  chat_e2e checks it with a stamped page (`/chatbot.oldwasm.html`). The route-time reload message (4b) stays for a router that throws.
- Tests: `engine_switch` became `rust_engine` (export list vs d.ts and Rust source, no switch, no twin left). `golden_contract` runs
  `wasm_golden_check` on the shipped wasm. Search tests (kb_search, kb_scope, kb_search_floor, chat_robust, phrase_hints) use `pageSearch`
  (`scripts/lib/chatbot_fns.mjs`: the page's own search block on the shipped wasm). `wasm_lockstep` keeps only the gate-floor checks (no
  twin to compare). answer_points_parity, readable_answer, schedule_table, staff_live, understand_step, date_awareness, per_major,
  english_programme run the page's wrappers with the shipped wasm. chat_e2e runs once (no js pass): 57 checks became 32.
- The JS oracle (golden_dump.mjs, dump_route_text_golden.mjs, `loadChatbotFns` / `loadSearch` / `loadUnderstand`) needs a snapshot:
  `git show 15ef269:submissions/ui/chatbot.html > /tmp/chatbot_ref.html && node scripts/golden_dump.mjs --check --html /tmp/chatbot_ref.html`
  (6/6 match). `benchmark/golden/README.md` and how-it-works slide 12 say so.
- Removed: `benchmark/engine/engine_ab.mjs`, `engine_micro.mjs` (A/B of the switch; `benchmark/engine/results` stays as history).
- Benchmarks moved to `pageSearch` / `pageDecideTier`: compare_retrievers (read by how_it_works, slides_claims, pitch_claims; claims
  unchanged), official_faq_eval, english_eval, note_rate, signals, embed, doc2query, programme_names.
- For step 6, still reading the removed JS internals (research scripts, in no gate): compare/latency.mjs, compare/decision_rule.mjs,
  synth/eval.mjs, synth/distill.mjs, synth/distance_gate.mjs, synth/segment_vs_trigram.mjs, abstain/experiment.mjs, scale/probe.mjs,
  gradmahidol/run_benchmark.mjs. Each needs a decision: point it at the snapshot (a JS experiment) or at the Rust search.
- Still JS on the page (page logic, not twins of a wasm export): `datedPicks`, `nearSpelling`, `_pLevel` / `_P_LEVEL`.

## Step 6a done (2026-11-09): the nine research benchmarks
- Rule: a benchmark that measures the product runs the page's Rust search / tier rule (`pageSearch`, `pageDecideTier`); a JS internal that an
  experiment needs and the page no longer ships comes from the snapshot (`scripts/lib/chatbot_fns.mjs`: `REF_COMMIT` = 15ef269, `refHtml()`
  via `git show`, `searchSource()`, `loadGramSet()`).
- Rust only: compare/latency (JS-twin row dropped; the resolver block gets the wasm, broken since 3a), synth/eval, scale/probe,
  gradmahidol/run_benchmark (gate band 0.60 / 0.80 copied from `decide/tier.rs` for its gate proxy).
- Rust search + snapshot `_jsGramSet` as a feature: synth/distill, synth/distance_gate, synth/segment_vs_trigram, abstain/experiment.
- compare/decision_rule: the shipped arm and decideTier are Rust; the two scorer variants are edits of the snapshot's JS `_cosToScore`.
- Checked against the recorded results: decision_rule = 008 (all rows), synth eval = 001, distill = 005, distance_gate = 008,
  segment_vs_trigram = 010 (all tables identical); latency matches the recorded WASM kb_search time (~4.4 ms; the removed JS twin was ~2 ms).
  abstain/experiment: 23/27 rows identical; the 4 rows that fit a threshold on the raw cosine move by 0.1-0.2 points. Cause: Rust `cos` is
  f32 (JS was f64); over 1056 questions the top entry, order and scores are identical, max cosine difference 3.8e-7. The JS snapshot
  reproduces the record 27/27. Not a product difference; the record stays.
- Not run: gradmahidol/run_benchmark (needs the external gm-corpus; syntax checked only). scale/probe has no recorded table.
- `integrations/_shared/answer_points.mjs` comment points at the Rust port instead of the removed inline copy.

