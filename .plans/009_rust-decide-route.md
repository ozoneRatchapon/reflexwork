# 009 - Move the chat's branch order (`_askCore`) into Rust: `decide_route(q, ctx) -> Route` (2026-11-07)

## Why
- `.plans/002` ported every pure function to `crates/reflex-wasm`, and the web has used it since 2026-11-04.
- The **order of decisions** is still a ~540-line if-chain in `submissions/ui/chatbot.html` `_askCore` (lines ~1870-2412). It is the real "hard-coded if-else":
  - It is untested as a whole.
  - LINE has its own copy (`integrations/_shared`, `line-worker`) that drifts.
- `benchmark/rules/003` shows the ordering matters more than any single regex. 3 wrong routes came from one branch firing before the KB answer.

## Branch map (order today; one `Route` variant each)
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
   - **Ported:** text preparation (`norm_chat`, `strip_lead_in`, Thai digits), `wellbeing`, `smalltalk`, `personal`, `stuck_pick`, `restart`, `overview`, `catalogue_not_ready`
     (7 of 34 routes). `kb_search` now has a native twin `kb_rank` (lib.rs), used through `route::Manual`.
   - **Next, in order:** `generic_fee` (needs `followUpAspect` when a programme is in focus), the programme branches (`Resolver` exists), `time_intent`, `followup` (needs `PCTX` as an input and an output),
     `scope_*` (`scopeClarify`), the KB tier (`decide_tier` exists), then the not-found family (`english_off_corpus`, `intake`, `topic_picks`, `not_found`).
   - The remaining term/year rewrite of `normTermYear` ("เทอม 1/2569") is not ported; the programme and time branches read it.
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
- 2026-11-07: step 0 done. Step 1 in Rust: 7 of the 34 routes are ported (wellbeing, smalltalk, personal, stuck_pick, restart, overview, catalogue_not_ready); all 1,613 recorded single questions and 1,727 text cases (normChat, wellbeingKind, personalAsk, stuckTopic, isRestartPhrase, isOverviewQuestion, hasStudyIntent) match the page.
- Found by the differential test: the page's `normalize('NFC')` DOES change Thai text (it reorders a tone mark typed before a lower vowel); the port reproduces that reordering for Thai. NFC composition of other scripts (Latin e + U+0301) is not ported (documented in route/text.rs).
