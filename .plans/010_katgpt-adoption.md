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
| corpus-distance gate (Reflex, reflex.riir.ai: 53% of its abstains) from our exemplars = entry text + train paraphrases | **no use against near-misses** (AUROC 0.47-0.54: a near-miss is on the same topic, so it sits close to the exemplars). **Weak use against questions outside the manual** (D_all 0.64 vs shipped score 0.52; only 46 such questions, 44 of them official FAQ items) | `008_distance_gate_unreviewed.md` |

Reading: model-free signals help a little; the separation problem is mostly solved only by a meaning-based signal. The distilled map
is the one way found to get part of that without a model per question, and it needs more (and multilingual) training questions.

## What reflex.riir.ai adds (read 2026-11-07, figures are theirs, not re-run)
- Modelless count-table engine: English intent 78-84% at 0.1-0.4 ms WITH many labelled examples per class (banking77 ~130 per class; we have ~8); raw confidence badly calibrated (ECE 0.64-0.82), hybrid 0.07-0.08.
- Thai needs a ~850 MB encoder (laya) to reach 41-78% on their two Thai suites, so no in-browser option there.
- Not comparable to our FAQ retrieval (classification suites, 77 classes); Reflex corpus boot takes 1-8 domains, so it cannot take our 132 entries as classes directly.

## Checklist
- [x] 1 Best-Belief vote bounds instead of the EMA (commit `121e086`; kernel-worker + dashboard deployed 2026-11-07)
- [x] 2 Answer-type note for factoid questions (commit `68ac1de`; Pages deployed)
- [ ] 3 Distilled trigram -> bge-m3 table: re-run fairly (more English, fresh question set, size budget); adopt only if >= +10 points
- [x] 4 Answer receipt covering the answer (commit `dc8f65f`; Pages deployed; `scripts/verify_receipt.mjs`)
- [~] 5 Follow-up state: the programme in focus is a typed field in the Rust `Ctx` (plan 009); a scored stack of several referents is NOT done
- [~] 6 Process: Verdict line + preregistered gates in every benchmark header, `NEGATIVE_RESULTS.md`, golden tests against the SHIPPED wasm file with a minimum count. (2026-11-09: DONE - `benchmark/NEGATIVE_RESULTS.md` (10 rows, each with its number against the shipped arm and its source file); shipped-wasm golden floors: `scripts/wasm_golden_check.mjs` fails a contract below ~95% of its 2026-11-09 size (a 39-line intake golden now fails 'TOO FEW'; before, it passed as '0 differences'), `benchmark/golden/route_rust_check.mjs` needs >= 2100 singles (2221 today) and now runs in CI. Verdict lines: DONE for all 33 tracked result files that lacked one (the 4 `benchmark/gates/` files already had one; `synth/011` is untracked and not ours): each says it was added 2026-11-09 from that file's own numbers and that no gates were preregistered, compares against the shipped arm where the file has one, and calls descriptive runs descriptive. All 79 JS test files still pass. LEFT (owner decision): new runs do not write a Verdict / gates header by themselves - that means changing the JS generators (`benchmark/compare/run_all.sh` and the `*.mjs` that write `results/`), which the Rust-first rule puts to the owner; until then a Verdict line is added by hand before a result is committed.)
- [ ] 7 Negation / polarity check for AI rephrasing ("ต้อง" -> "ไม่ต้อง"): small, not built. (2026-11-09, owner input needed: (a) where - the grounding guard is `groundedGuard` in the llm-proxy worker (plain JS, also guards LINE), or a Rust check the page calls on the AI text (web only until LINE loads the wasm, plan 009); the owner's Rust-first rule decides; (b) a measurement set - no AI rephrasings are recorded, and a false-reject rate needs real ones from the dev proxy (spends the Gemini key). Markers like ไม่เกิน / ไม่ว่า make a naive rule reject correct rephrasings.)
- [ ] 8 Thai closed-class lexicon (months, Thai digits, BE years, number words, units) for the answer-type check and value-normalised grounding. (2026-11-09 measurement, `benchmark/rules/type_lexicon_probe.mjs`, untracked: for each entry's own title + เท่าไร / กี่วัน / เมื่อไหร่ the note fires 215 of 396 times and 0 of those come from a value in Thai digits or Thai number words; 0 on the generated questions too (`synth/011`). So the lexicon fixes nothing in the answer-type note today. The grounding use ('2 สัปดาห์' = '14 วัน') is unmeasured: build only after counting how often the proxy guard drops a correct rephrasing for a unit change. Recorded in `benchmark/NEGATIVE_RESULTS.md`.)

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

## Thai vocabulary (asked 2026-11-07: build a Thai word store like the English side?)
- What the English side of katgpt-rs actually is: not a dictionary. `katgpt-extract/src/parsers/{words,datetime}.rs` hold small CLOSED lists (number words, ordinals, months, units) for deterministic typed parsers; the tokenizer crate has BPE/trie code. No general English word list was found.
- Measured here (`benchmark/synth/010_segment_vs_trigram.md`): a Thai word vocabulary (Node's ICU dictionary segmenter as a stand-in) does NOT beat character trigrams for finding the right entry: words alone 45.8% vs trigrams 53.8% (Thai held-out), words+trigrams 54.2% (+0.4, noise), words+bigrams 50.4%; official FAQ 84.5% vs 94.4%. The misses are meaning (different words), not tokenisation, so a dictionary does not touch them.
- Worth building: the Thai equivalent of the English closed lists - Thai months and abbreviations, Thai digits, Buddhist-era years, Thai number words, units (วัน สัปดาห์ เดือน บาท หน่วยกิต), ordinals, day names - for the answer-type check (`missingTypes`) and for value-normalised grounding. Small, no licence question, written from the manual's own usage.
- klangkid.vercel.app (คลังคิด): a dictionary web app built for a Royal Society of Thailand / NECTEC hackathon, "not an official service of any agency". Its terms: words and definitions come from the Royal Society's dictionaries (2542, 2554, 2569 draft) "used under conditions set by the Office"; extras from Thai WordNet and Thai Wiktionary (CC BY-SA 4.0) are unreviewed and starred; no bulk download is offered (only fonts and logos); it has a public API (Swagger at /api/docs) whose terms for programmatic use I did not read. Do NOT vendor its word data without the Royal Society's permission; query expansion with unreviewed WordNet synonyms is the kind of change that already hurt retrieval (doc2query, 002).

## Second look (2026-11-09, after the owner read katopz.github.io/katgpt-web, "The Anatomy of KatGPT-RS")
Read-only review of katgpt-rs at HEAD (67 commits after 85f3bc510, mostly docs; no new crates) plus two throwaway probes on the shipped search over `benchmark/synth/questions_001.json` (labels **unreviewed**). Most anatomy ideas are tree search / token generation, which ReflexWork does not have. What the anatomy numbers are: Sudoku 46/84/100% = one 100-node demo (`examples/sudoku_02_speculative.rs`), not a benchmark; 7,079.9x = 49,559 steps / 7 hull vertices, a trace-compression ratio; bandit +37.5pp survival (`.benchmarks/006_shared_vs_independent_hl.md`) came with wins 269 -> 43, marked FAIL there; 8.0M vs 1.7M tok/s not found in the repo.
- [~] A (run 2026-11-10, `benchmark/synth/012_rerank_unreviewed.md`: gate NOT met - every re-rank arm gains in every set but Thai only +6.1 (shippable 128-d top-5) / +7.2 (1024-d top-5) of the +10 required; not shipped; best candidate for the fresh reviewed set of item 3) **Draft then verify** (`katgpt-speculative/src/dd_tree/tree_builder.rs` ~559-620: score = ln P(draft) + ln R(relevance), the verifier only sees drafted candidates). Re-rank only the trigram top-K with cos_lex + w*cos_distilled. Headroom measured on the Thai held-out: right entry first 276/528; of the 252 misses it is in top-3 for 92, top-5 126, top-10 168 (ceiling 69.7% at K=3, 84.1% at K=10). Run it as extra arms of item 3 (shipped, hybrid D, re-rank K=3/5/10, w fit on train folds, 5-fold). Gate (preregistered): Thai first-right >= +10 points over 53.4%; English, eval52 (84%) and FAQ (94.4%) not below shipped; near-misses answered with their own source entry <= 22.0%; map <= 500 KB gzip. Build in Rust (`crates/reflex-wasm/src/resolve/`).
- [x] B (done 2026-11-09 as `crates/reflex-bench/src/retention.rs`; first used by A) **Retention gate** (`katgpt-core/src/adoption_gate.rs`): for each challenger arm report "retained" = share of the questions shipped gets right that the challenger still gets right; adopt only with a net gain AND retained >= 0.95 on eval52 + FAQ. Catches swaps that cancel out in a net first-right number. Rust, `crates/reflex-gate`. ~1 day.
- [x] C (measured 2026-11-10, not built: `benchmark/journeys/results/002_2026-11-09_followup_latch.md` - 36 scripted dialogues / 126 turns (6 templates x 6 programme pairs, unreviewed), the shipped order answered about the wrong programme 0 of 102 times, missed 0; negative control 102/102 wrong, so the metric can see a failure. Nothing to halve; revisit with real multi-turn logs) **Follow-up latch** (`pick_latch.rs`): keep `programme_in_focus` unless the new question's resolver score beats it by a margin; check candidates against the constraints gathered over the conversation. Needs 30-50 scripted dialogues first (same set as item 5). Gate: wrong-programme rate at least halved, `route_rust_check` still >= 2100 singles.
- [x] D (done 2026-11-09, `benchmark/abstain/002_2026-11-09_certified_bound.md`: shipped wrong-among-answered at most 24.9 % (95 %) on the reviewed set) **Certified threshold** (`certified_frontier.rs` `cp_upper`, Clopper-Pearson): for each tier threshold report the upper bound (delta 0.05) on "answered with a wrong entry"; pick the lowest threshold whose bound <= epsilon. Adds no score, so it is not the rejected Temper gate; it cannot raise AUROC (0.504), the expected outcome is an honest stated bound. ~half a day.
- Measured and dropped: answer-type screening as a re-rank (top-10 cos x0.7 when the type is missing): Thai 276 -> 277/528, English 128 -> 130/264 - too small. Year / category pre-filter: 8 of 252 Thai misses mention a year; in 133 of 252 the wrong top entry is in the right category. Early exit (132 entries, no latency problem), speculative AR draft (nothing generated in the browser), shared bandit for votes (no vote data; their own bench failed).

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
