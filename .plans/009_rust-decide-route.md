# 009 - Move the chat's branch order (`_askCore`) into Rust: `decide_route(q, ctx) -> Route` (2026-11-07)

## Why
- `.plans/002` ported every pure function to `crates/reflex-wasm`, and the web has used it since 2026-11-04.
- The **order of decisions** is still a ~540-line if-chain in `submissions/ui/chatbot.html` `_askCore` (lines ~1870-2412). It is the real "hard-coded if-else":
  - It is untested as a whole.
  - LINE has its own copy (`integrations/_shared`, `line-worker`) that drifts.
- `benchmark/rules/003` shows the ordering matters more than any single regex. 3 wrong routes came from one branch firing before the KB answer.

## Checklist (tick it when it lands; the details are below)
Source of truth for "done": `cargo test -p reflex-wasm` green (`tests/golden_route.rs` = the contract, `tests/route_text.rs`, `tests/dated_picks.rs`) and `node tests/route_golden.test.mjs` green.

### A. The 34 routes in Rust (`crates/reflex-wasm/src/route`, in the order the page tries them)
- [x] 1 `wellbeing`
- [x] 2 `smalltalk`
- [x] 3 `personal`
- [x] 4 `stuck_pick`
- [x] 5 `restart`, `overview`
- [x] 6 `catalogue_not_ready`
- [x] 7 `generic_fee`
- [x] 8-9 `programme_card`, `programme_pick`
- [x] 10 `field_fee`
- [x] 11 `free_study`
- [x] 12 `career`
- [x] 13 `finder`
- [x] 14 `followup`
- [x] 15 `free_fee`
- [x] 16 `time_intent`
- [x] 17 verdict: gate score (`route_with_gate`) + `decide_tier` + the account-problem override (`classify_issue`)
- [x] 18 `scope_ask`, `scope_no_year`, `scope_no_round` (`scopeClarify`, `scopeOf`, `scopeYears`)
- [x] 19 `advice_abstain`, `advice_strong`, `advice_hybrid` (needs `Ctx.ai_off`)
- [x] 20 `kb_act`
- [x] 21 `disambiguate`
- [x] 22 not-found family: `not_a_question`, `other_script`, `english_off_corpus`, `intake` (ported: `not_a_question` (`is_not_a_question`, `P_ACK`), `other_script` (`is_other_script`), `english_off_corpus` (`is_english`), `intake` (`crate::intake::classify_issue`, last in the family); probes 11, 12, 102, 12; `golden_route` passes (2 tests); `route_golden.mjs --check`: 2152 checked, 0 differences; clippy clean)
- [x] 23 not-found family: `unsure_programme`, `tuition_finder_nomatch` (`nearSpelling`) (probes: 70 and 26; ported in `route/near.rs` + `branches.rs::finder_branches`; in `PORTED`; golden_route 2 passed)
- [x] 24 not-found family (`not_found` is the fall-through reply, now reachable after item 25: `decide_route` returns None when no branch and no phrase clears the bar): `topic_picks` DONE (`route/topic.rs`, in `PORTED`, 15 samples). `not_found` NOT ported: its 3 `ai_on` samples are `not_found` but with AI on the page may answer `understood_by_ai` instead, so the branch needs the item-25 rewrite contract before it can be decided. (2026-11-09: decided. `not_found` stays the fall-through, not a `Route` variant: `decide_route` returns None after the rewrite step and the page shows the not-found reply. `golden_route.rs` pins it: all 279 `not_found` singles must get None - 270 ai_off, the 3 ai_on (dead proxy) and 6 ai_mock (the rewrite answered, no phrase cleared the bar) - plus 6 session turns; passes.)
- [x] 25 `understood_by_ai` (2026-11-07): the branch is ported (`route/understood.rs`: `understood_outcome` = the page's `understand` over the manual search, `understood_route`, and `decide_route` = `decide_prefix` then the rewrite step). The AI call stays on the page; Rust takes the phrases. Contract: `benchmark/golden/rewrite_mock.json` (47 questions -> phrases, shared by `route_golden.mjs` `ai_mock` mode and `golden_route.rs`), 12 `understood_by_ai` samples (>= 10). `--check` 2199 checked, 0 differences; `cargo test` all suites pass; clippy clean. LIMITS: (a) the phrases were tuned by hand on these same questions (overfit: the contract checks the wiring, not Gemini's wording); (b) the Rust test manual has `staff: false` on every entry, so `_staffSupersede` is not exercised by this branch; (c) real `/rewrite` answers were not recorded, so the live hit rate is unmeasured.
Progress (2026-11-09): all 34 decided - 33 named routes in `PORTED`, and `not_found` as the None fall-through. Since plan 015 the page has no other copy of the order.

### B. Supporting work
- [x] Contract: every branch names itself (`data-route`), `benchmark/golden/route.json` (singles + 24 sessions), recorder isolated from tab storage
- [x] Text preparation: `norm_chat`, `strip_lead_in`, `norm_term_year`, exact Unicode tables
- [x] Differentials against the page's own functions (`route_text.json`: ~2,265 texts; `dated_picks.json`; `scope.json`: 2,306 scopeClarify cases)
- [x] `kb_rank` (native twin of `kb_search`), `route::Manual`, `Ctx` (programme in focus, today, catalogue state)
- [x] Contract probes (2026-11-08): `scope_no_round` 1 -> 12 (done). Still thin: `scope_no_year` 4, `advice_abstain` 1 (needs a weak KB match that still passes the act verdict: none found in 8 advice probes), `advice_hybrid` 5, `free_fee` 3. `intake` 13 now. The not-found family needs its own probes before it is ported. (2026-11-09: the counts above are stale - the `*_MORE` probe lists in `route_golden.mjs` brought the singles in `route.json` to scope_no_year 13, advice_abstain 10, advice_hybrid 13, free_fee 11, scope_no_round 11, intake 12, all >= 10; not_found has 279.)
- [x] Sessions replayed for the verdict routes (a turn on a route that is not ported cannot change state yet). (2026-11-09: every route is decided now, so `golden_route.rs` replays all 24 sessions / 68 turns with the programme in focus carried over, verdict turns included - kb_act 14, not_found 6, scope_ask, scope_no_round, disambiguate, intake 1 each; `cargo test -p reflex-wasm --test golden_route` passes. Thin: no advice_* turn in a session.)
- [ ] `PIN` (a tapped topic chip) in the contract: today `pinned` is always false in the tests

### C. Switching the page and the other channels
- [x] Export from `reflex-wasm`: `Router` (`#[wasm_bindgen]`, `new(kb, programmes)` + `decide(q, state, rewrite)`), rebuilt `submissions/ui/wasm` with `crates/reflex-wasm/build.sh` (2026-11-07). The page does NOT use it for answers yet.
- [x] SHADOW MODE (2026-11-07): `chatbot.html` runs `Router.decide` beside its own branches and only compares the route name (`window.__shadow`). Golden run: 4418 page questions, 4418 same, 0 differ, 0 errors (`route_golden.mjs --check` prints the totals). e2e 56/56, `wasm_golden_check` 0 differences, cargo test + clippy clean. Not run: `demo_smoke` (it targets production and calls the LLM).
- [x] ROUTE SWITCH behind `?route=rust` (2026-11-07): every route site in `_askCore` asks `take(name, condition)`; with `?route=rust` the route is the one Rust chose (`RUST_TURN`), the branch bodies are unchanged. Verified: `route_golden.mjs --check --route rust`: 2199 checked, 0 differences; shadow 4418 same, 0 differ; e2e 81/81 (rust, js, rust+route=rust). DEFAULT IS NOW RUST (2026-11-07, source only: not committed, not deployed); `?route=js` = the JS conditions. Not switched yet: the AI-rewrite verdict (`understood`, async, still JS), and the data guards inside bodies (kept as safety checks).
- [x] `?route=rust` is the default (e2e 56/56 with `?engine=rust` and `?engine=js&route=js`; golden every-5th sample 0 differences on the default page)
- [x] Remove the JS conditions and the `?route=js` fallback after a production soak (owner decision). (Done without a soak by owner decision 2026-11-08: plan 015 step 4a `a3fe732` removed `?route=js`, step 4b removed the JS conditions; a missing / failing router shows a reload message.)
- [x] Commit `38bec4c` on feature/modelless-npc (2026-11-07). Preview deployed: https://feature-modelless-npc.reflexwork.pages.dev (demo_smoke: all hard checks pass, 1 warning: no LLM on preview by design).
- [ ] Production: merge to main + `submissions/deploy_pages.sh main` (owner decision; not done) contract identical on all entries (`node benchmark/golden/route_golden.mjs --check`), e2e 56/56, `demo_smoke` x4, `wasm_golden_check`
- [x] Delete the JS branch order from `chatbot.html`; flip the regex source of truth to Rust (`scripts/gen_rust_pattern_sources.mjs`). (Plan 015: step 4b deleted the branch conditions, 4c/5 the readers; step 3a `c73b199` moved the regexes to `packs/graduate-school/vocab.json` + Rust and deleted `gen_rust_pattern_sources.mjs` and its sync test.)
- [ ] LINE loads the same wasm (measure Workers cold start first)
- [ ] Deploy (Pages main + any worker) after the above; NOT before

### D. Decisions that are not ours to make alone
- [ ] Embeddings at run time (bge-m3: Thai 52% -> 75% first-right, needs a model per question; `benchmark/synth/README.md`)
- [ ] Review sheet `benchmark/synth/review_001.tsv` filled by a person (a second AI read was done: 3 of 60 labels wrong)
- [ ] Deploy `how-it-works.html` text change (committed `1d29927`, not live; the last deploy command was refused)

## Branch map as first sketched (kept for the reasoning; the checklist above is the current list of 34 routes)
1. `Wellbeing`: `wellbeingKind`. Comes before smalltalk.
2. `Smalltalk`: `classifySmalltalk` (wasm).
3. `Personal`: `personalAsk`. Refused, not logged.
4. `Stuck`: `stuckTopic` ("ติดปัญหา").
5. `Overview` / `Restart`: `isOverviewQuestion`, `isRestartPhrase`.
6. `CatalogueNotReady`: `PROG_STATE` not ok / none, and the question reads as a study question.
7. `GenericFee`: `isGenericFeeQuestion`, with no follow-up aspect.
8. `StaffFirst` (a flag): a staff answer with s >= 6 beats the resolver.
9. `Programme`: `resolveProgramme`, or `englishProgrammeAsk` (wasm resolver).
10. `FieldFee`: `isTuitionQuestion` plus loose resolver rows.
11. `FreeStudy`: `_P_FREEQ` and `_P_FREESTUDY`.
12. `Career`: `isCareerQuestion`.
13. `Finder`: `isFinderQuestion` or `isLevelOnlyQuestion`.
14. `FollowUp`: `PCTX` and `followUpAspect`.
15. `FreePremise`: `_P_FREEQ` plus a fee word.
16. `TimeIntent`: `timeIntent`.
17. `Kb`: `decideTier` (wasm), then:
    - the `classifyIssue` override;
    - `scopeClarify` (ask year/term);
    - act / disambiguate / escalate;
    - the no-match fallbacks:
      - finder;
      - tuition finder;
      - `topicPicks`;
      - decline.

## Steps (owner decision 2026-11-07: Rust directly - no intermediate JS `routeOf`)
0. **DONE** - contract: `benchmark/golden/route.json` (see below).
1. **Port the branches into `crates/reflex-wasm/src/route/` in the order the page tries them.** An ORDERED PREFIX is always exact:
   `decide_prefix(typed, pinned) -> Option<Route>`; `None` = "continue with the branches not ported yet".
   After each branch, add it to `PORTED` in `crates/reflex-wasm/tests/golden_route.rs`. The test then requires, for every recorded single question:
   (a) a ported branch on the page = the same branch in Rust; (b) any other branch on the page = `None` in Rust.
   Text functions are also checked one by one against the page's own code on 1,600+ strings: `benchmark/golden/route_text.json`
   (`node scripts/dump_route_text_golden.mjs`), `crates/reflex-wasm/tests/route_text.rs`.
   - **Ported (17 of 34 routes):** text preparation (`norm_chat`, `strip_lead_in`, Thai digits), then in the page's order: `wellbeing`, `smalltalk`, `personal`, `stuck_pick`,
     `restart`, `overview`, `catalogue_not_ready`, `generic_fee`, `programme_card`, `programme_pick`, `field_fee`, `free_study`, `career`, `finder`, `followup`, `free_fee`, `time_intent` (`route::dates`: `date_span`, `time_intent`, `dated_picks`; today is an input, `Ctx.today`).
     `decide_prefix(typed, &mut Ctx)` now changes the programme in focus like the page (a card sets it; a picker, the finders, restart and generic_fee clear it).
     Helpers: `kb_rank` (native twin of `kb_search`), `route::Manual`, `Catalogue::resolve` (strict + loose), `follow_up_aspect`, `is_generic_fee_question`, `is_finder_question`,
     `is_level_only_question`, `english_programme_ask`, `is_career_question`, `is_tuition_question`.
   - **Next, in order:** the verdict: `route_task` gate score (native `route_with_gate`), `decide_tier`, the account-problem override (`classify_issue`), `scope_*` (`scopeClarify`: ~100 lines, year / term / round), then the manual's tier (`decide_tier` exists;
     advice_* and kb_act / disambiguate), then the not-found family (`not_a_question`, `other_script`, `english_off_corpus`, `intake`, `unsure_programme`, `tuition_finder_nomatch`, `topic_picks`, `not_found`).
   - `normTermYear` ("เทอม 1/2569" -> "ภาคต้น ปีการศึกษา 2569") is ported (`route::term_year`, lookaheads done by capturing the next character); `prepare()` uses it. Differential: 60 of 2,235 texts are changed by it, all identical to the page.
2. **State:** `decide_route(typed, &mut Ctx)` where `Ctx` holds `pinned`, the programme in focus (`PCTX`) and the catalogue/manual state. The 14 recorded sessions
   in the contract are the test for it.
3. **Switch the page** to the wasm `decide_route` (`?engine=js` keeps the old path until the switch is proven): contract identical on all entries,
   e2e, smoke x4, `wasm_golden_check`. Then delete the JS branch order.
4. **LINE loads the same wasm.** Measure Workers cold start first.

## Rules
- The UI stays JS (view only).
- `.rs` under 1,024 lines.
- Use `match` over if-chains.
- Regex sources are still generated from chatbot.html (`scripts/gen_rust_pattern_sources.mjs`) until step 3 is done. After that, flip the direction: Rust becomes the source and JS is generated or deleted.

## Step 0 - DONE 2026-11-07 (page-only, no behaviour change)
- Every branch of `_askCore` names itself: `ROUTE_NAME = '...'` (35 labels). `_add` stamps each bot bubble with `data-route`. The start of an ask sets `'unrouted'`, so a branch nobody labelled shows up in the contract instead of hiding.
- `benchmark/golden/route_golden.mjs`: records / checks the branch per question in a real headless Chrome (AI off or a dead proxy, kernel unreachable). `benchmark/golden/route.json` = the contract: ~1,450 single questions (the test sets + the generated questions), each after "เริ่มใหม่", plus 14 follow-up sessions where state carries over, plus probes for branches the sets never reach (modes: `ai_off`, `ai_on` with a dead proxy, `nocat` = programmes.json answers 500).
- `tests/route_golden.test.mjs` re-checks every 12th entry in CI (`--check --limit 12`); the full check is `node benchmark/golden/route_golden.mjs --check`.
- Known hole: `understood_by_ai` needs a WORKING `/rewrite`; not reachable without a mock proxy.
- The contract is tied to the manual: rebuild it (`--write`) when `knowledge-index.json`, `programmes.json` or the decision order changes ON PURPOSE.

## Status
- 2026-11-07: step 0 done. Step 1 in Rust: 17 of the 34 routes are ported (everything up to and including time_intent); the whole contract (single questions + 68 session turns replayed with the programme in focus carried over), 2,053 text cases and 33 datedPicks cases (normChat, wellbeingKind, personalAsk, stuckTopic, isRestartPhrase, isOverviewQuestion, hasStudyIntent, followUpAspect, isGenericFeeQuestion, isFinderQuestion, isLevelOnlyQuestion, englishProgrammeAsk) match the page.
- Found by the differential test: the page's `normalize('NFC')` DOES change Thai text (it reorders a tone mark typed before a lower vowel); the port reproduces that reordering for Thai. NFC composition of other scripts (Latin e + U+0301) is not ported (documented in route/text.rs).
