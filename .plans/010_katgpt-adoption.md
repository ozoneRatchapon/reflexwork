# 010 - What to take from katgpt-rs (deep dive 2026-11-07)

Source: `~/projects/katgpt-rs` (origin ozoneRatchapon/katgpt-rs, HEAD 85f3bc510, 2026-11-06). 34 crates, ~2,000 .rs files.
Four read-only reviews (abstain / grounding / extraction; retrieval without a model; belief state / NPC; process + core primitives), then
experiments here on the 1,056 generated questions (`benchmark/synth/`, labels **unreviewed**).

## Measured here (benchmark/synth)
| idea (katgpt source) | result | file |
|---|---|---|
| distil bge-m3 into a trigram -> vector map, offline ridge (`katgpt-canon/src/source_adapter.rs`, `katgpt-core/src/linalg/ridge_solve.rs`) | Thai held-out 53.4% -> **62.9%** first-right with no model at run time (bge-m3 itself: 74.2%); English **worse** (43.9 -> 28.0%, only 1 English example per entry in training); hybrid (lexical if s>=4 else distilled): Thai 61.7%, eval52 84 -> 88%, FAQ 94.4 -> 93.0% | `005_distill_unreviewed.md` |
| answer-type match (composed from `katgpt-extract/src/parsers/*`) | flags 26.5% of near-misses as "asks for a value the entry does not have" at a cost of 2.5% of Thai (7.2% of English) paraphrases. A first version with a bare "เท่าไร" counted as an amount flagged 29.5% / 3.2% but said "no amount" about score questions; fixed | `006_answer_type_unreviewed.md` |
| model-free abstain signals, rank-fused (`distance_abstain.rs` lesson: fuse on ranks) | best AUROC **0.60** (cos margin + answer-type; 0.598) vs shipped score 0.53; bge-m3 0.85 | `007_signals_unreviewed.md` |

Reading: model-free signals help a little; the separation problem is mostly solved only by a meaning-based signal. The distilled map
is the one way found to get part of that without a model per question, and it needs more (and multilingual) training questions.

## Take (ranked)
1. **Best-Belief Beta lower bound instead of the `entry_conf` EMA.** `katgpt-core/src/best_belief.rs`, katgpt Bench 010: 15-30% less selection regret when vote counts differ. Pure math, S. Score = 5% quantile of Beta(1+up, 1+down); explains itself ("at least 0.62 from 8 up / 1 down"). Reset counts when an entry's text changes (`calibration_staleness.rs` doctrine).
2. **Answer-type match as a note + gap-log rule.** DONE in the page 2026-11-07 (`missingTypes` / `typeMissNote`, `tests/answer_type.test.mjs`): the answer still shows, with "this topic does not state the [amount/duration/date/number] asked", and the question goes to the gap list. It appears on 6.2% of the answers the test pool gets (`benchmark/rules/note_rate.mjs`). Precise (2.5% cost) though it covers only factoid questions. Port the scanner DESIGN of `katgpt-extract/src/parsers` (ranked candidates, byte spans, abstain instead of clamp) with our own Thai grammar (Thai months, พ.ศ., Thai digits); the same parsers can make `groundedGuard` compare normalised values ("2 สัปดาห์" = "14 วัน").
3. **Distilled trigram map (experiment -> maybe feature).**
   - Next run:
     - generate more English and a second prompt / model for a fair held-out set;
     - PCA-k targets;
     - an explicit sparse W (size budget ~500 KB gzip);
     - 5-fold.
   - Decision rule (the reviewer's, adopted): ship only if the hybrid beats lexical by >= 10 points on a fresh-paraphrase set within the size budget.
4. **Decision commitment that covers the answer.** Hash `question_norm || route || entry_id || entry_version_hash || kb_root`, where `kb_root` is a hash over the sorted entry hashes (a plain sorted hash is enough at 132 entries; `lthash.rs` is overkill). This closes "the fingerprint does not cover the answer".
5. **Follow-up state as a small scored stack of referents** (programme card, picked topic, earlier programme) with a type-compatibility likelihood ("ค่าเทอม" needs a programme). If the top weight is low, ask. `katgpt-micro-belief/src/nonergodic.rs` (Bench 706) is the rigorous version, used only if several referents really compete. Needs 30-50 scripted follow-up dialogues as the regression set.
6. **Process.**
   - **Benchmark headers:** every benchmark file starts with a `Verdict:` line and pre-registered gates (G1 correct, G2 speed, G3 no regression vs shipped, G4 size).
   - **Fixed arms:** always include the floor (shipped) and a control arm. Add a shuffled / empty-corpus falsification arm.
   - **`NEGATIVE_RESULTS.md`:** record losers so they are not retried. Start with doc2query, alias items, Temper-style threshold, Platt recalibration (cannot raise AUROC) and perturbation instability (riir-reflex Bench 092: lost 8/8).
   - **Golden min-count:** golden tests assert a minimum fixture count.
   - **Test the shipped file:** run golden against the shipped wasm file.

## Do not take (and why)
- katgpt-core as a dependency (pulls rayon, fastrand, blake3, serde, postcard; vendor single files instead, MIT).
- micro-belief attractors / latent thoughts, personality composition, sense octree, PKM / lattice memory, Procrustes adapters (game or transformer internals; several failed their own gates).
- perturbation ensemble (failed), Platt / sigmoid recalibration for AUROC (monotone: cannot change ranking), conformal intervals (numeric forecasts), claim_rubric / clr / validator (other domains).
- katgpt-assign for staff planning: solid (Bench 924: 3-47x over first-fit) but overkill for 5-15 staff; revisit when planning is real.

## Not found anywhere in katgpt
- **A model-free text encoder:** sleep-time anticipation assumes a query vector already exists.
- **Thai segmentation:** `span_pointer`'s tokenizer treats a Thai run as one token.
- **Negation / polarity check (ต้อง → ไม่ต้อง):** write our own.
  - Rule: compare negation markers (ไม่, ห้าม, not, no) of the source sentence and the rephrased one.
  - Status: small, not built.

## Status
- 2026-11-07: experiments 005-007 done. Nothing changed in the chat.
- The 4 reviews were run as read-only agents; their file and benchmark citations were spot-checked for best_belief (`.benchmarks/010_best_belief_floor_comparison.md` says what the review said).
