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

## Steps (one PR each, each shippable)
0. **Golden route contract.** Record the route for every question in a large pool, in the real page:
   - Pool:
     - `benchmark/rules` 387 questions;
     - synthetic questions `benchmark/synth/questions_001.json` (~1,000);
     - the e2e journeys, for follow-up state.
   - Tool: `benchmark/rules/branch_hits.mjs` already records the route label in headless Chrome. Extend it to write a stable machine name per branch: add `data-route="..."` to each bubble in the page (view only, no behaviour change).
1. **Pure JS `routeOf(q, ctx)`.** It returns the variant plus the data the renderer needs. `_askCore` becomes:
   - `const r = routeOf(q, ctx)`;
   - then `switch(r.kind)` → the existing renderers, unchanged.
   - Golden must stay identical. This step is the risky one (state: `PCTX`, `PIN`, `PROG_STATE`, `_pre`); do it alone.
2. **Rust `decide_route`.**
   - Code: `crates/reflex-wasm/src/route/{mod.rs,types.rs,decide.rs}`, with `enum Route`, `struct RouteCtx {pinned, prog_state, pctx, staff_first, ...}` and a `match` chain.
   - Missing predicates get ported into Rust first, each against its own golden: `wellbeing_kind`, `personal_ask`, `stuck_topic`, `time_intent`, `follow_up_aspect`, `is_overview`, `is_restart`, `is_career`, `is_finder`, `is_level_only`, `is_tuition`, `is_generic_fee`.
3. **Switch the page** to the wasm `decide_route` behind the existing JS fallback (`?engine=js`):
   - A/B on the golden pool must be identical.
   - Then run e2e, smoke ×4 and `wasm_golden_check`.
4. **LINE loads the same wasm.** Measure Workers cold start first. LINE then gets the same routes, including the new version labels.

## Rules
- The UI stays JS (view only).
- `.rs` under 1,024 lines.
- Use `match` over if-chains.
- Regex sources are still generated from chatbot.html (`scripts/gen_rust_pattern_sources.mjs`) until step 3 is done. After that, flip the direction: Rust becomes the source and JS is generated or deleted.

## Status
- 2026-11-07: plan only. Nothing ported.
