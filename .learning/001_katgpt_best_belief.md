# 001 - katgpt-rs best_belief: Beta lower bound for conservative selection (2026-11-08)

**Verdict:** Definition, edge case and LUT design checked in source. The benchmark gain is katgpt-rs's own reported figure, not re-run here.
Confidence: high for the code claims, medium for the benchmark claim.

Source repo: `~/projects/katgpt-rs`, file `crates/katgpt-core/src/best_belief.rs` (879 lines, last commit 474a9bfc, 2026-10-18).
Feature flag: `best_belief` in `katgpt-core` (`lib.rs:154`).

## Claims

| # | claim | source | how checked | confidence |
|---|---|---|---|---|
| 1 | `BB_ε(S,F) = I⁻¹_ε(1+S, 1+F)`: the ε-quantile of Beta(1+S, 1+F); a lower ε is more conservative. | `best_belief.rs` module doc (lines 1-30) | read the doc and the signature `best_belief_score(successes, failures, epsilon) -> f32` (line 183) | high |
| 2 | With no observations (S=F=0) the score is ε itself (uniform prior, clamped to [1e-7, 1-1e-7]). | `best_belief.rs:192-194` and the comment above it | read the code; unit test `best_belief_score_uniform_prior` exists (line 672) | high |
| 3 | A precomputed table covers S, F < 32 at ε in {0.01, 0.05, 0.1, 0.25, 0.5} (about 20 KB); other inputs use the closed form. | LUT section, `best_belief.rs` (`LUT_S`, `LUT_F`, `LUT_EPS`) | read the constants and `lut_lookup` | high |
| 4 | The library's own tests for this module pass: 18 tests. | local run | `cargo test --quiet -p katgpt-core best_belief` gave "18 passed; 0 failed" | high |
| 5 | With a fixed observation count n, selection by Beta lower bound equals selection by the MLE rate S/n (a monotone function). So no gain there. | katgpt-rs `.benchmarks/010_best_belief_floor_comparison.md`, Method and TL;DR | NOT re-run here; read only | medium |
| 6 | With variable n (heteroscedastic), selection regret drops 15-30% compared with the MLE rate, and up to 77% in a low-data stress test. | same benchmark file | NOT re-run here; katgpt-rs's reported figure | medium |
| 7 | ReflexWork uses this for entry confidence (commit `121e086`): `conf` = Beta posterior mean, and the dashboard shows 95% bounds from vote counts. | `integrations/kernel-worker/worker.mjs`, `submissions/ui/dashboard.html:314` | rg for `best_belief` / `Beta` in both files | high (use); the Rust code is not called directly, the logic is ported |

## What this means for us
- The lower bound is useful when entries have different numbers of votes. An entry with 2 up and 0 down should not outrank one with 50 up and 10 down just because its rate is higher. Claim 5 says that with equal vote counts the ranking does not change, so the effect is on new or rarely voted entries.
- Claims 5 and 6 are katgpt-rs's measurements on its own test setup. We have not measured the gain on our entries. Before relying on the 15-30% figure, a check on our own vote logs is needed.

## Open questions (for the owner)
- Do the vote logs for the 132 FAQ entries have enough variation in n to show any gain? If most entries have 0-2 votes, the bound mostly reflects the prior.
- Is the ported formula in `worker.mjs` the same as claim 1 (same ε, same +1 pseudocount)? Not checked line by line in this entry.

## Not claimed
- That the bound improves answer correctness. It only changes how entry confidence is ranked.
- Anything about the answer text itself.
