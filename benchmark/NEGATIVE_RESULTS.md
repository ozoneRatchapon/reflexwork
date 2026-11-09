# Negative results: ideas that lost, so they are not retried

Plan 010 item 6. One row per idea we tried (or rejected on a known result) that did NOT beat what ships. Before re-running one, read its
file and say what is different this time (more data, a new signal, a different gate). Numbers marked *unreviewed* use the generated questions
in `benchmark/synth` (`questions_001.json`, labels not yet checked by a person; a second AI read found 3 of 60 wrong, `009_eval_claude_reviewed.md`).

| idea | what was measured | result vs shipped | source |
|---|---|---|---|
| **doc2query**: add half the Thai paraphrases to each entry's keywords | first-right on held-out Thai paraphrases, eval52, official FAQ | worse everywhere: Thai 53.4% -> 42.8%, eval52 84% -> 76%, FAQ 94.4% -> 88.7% (*unreviewed*) | `synth/002_doc2query_unreviewed.md` |
| **alias items**: each paraphrase its own index item, best item wins | same | worse: Thai 53.4% -> 33.7%, eval52 84% -> 68%, FAQ 94.4% -> 88.7% (*unreviewed*) | `synth/002_doc2query_unreviewed.md` |
| **Temper-style calibrated abstain gate** (katgpt-rs `temper.rs`: sigmoid(margin/spread) >= tau AND best >= delta) | answers on negatives at equal recall, 3 fold settings | worse: answers negatives 59-65% vs 50-53% for the shipped fixed thresholds; the missing signal is not in the score, so no threshold recovers it | `abstain/001_2026-11-06.md` |
| **Platt / sigmoid recalibration to raise AUROC** | not run: a monotone map of one score cannot change its ranking, so AUROC is unchanged by construction | no gain possible | plan 010, "Do not take" |
| **Perturbation ensemble** (stability over perturbed copies of the question) | not run here; riir-reflex Bench 092 reports it lost 8 of 8 (their figure) | rejected on their result | plan 010, "Do not take" |
| **Corpus-distance gate against near-misses** (Reflex idea; exemplars = entry text + train paraphrases) | AUROC, held-out Thai paraphrases vs near-misses | no separation: 0.47-0.54 (a near-miss is on the same topic, so it sits close to the exemplars). Weak against questions outside the manual: 0.64 vs 0.52, on only 46 such questions (*unreviewed*) | `synth/008_distance_gate_unreviewed.md` |
| **Model-free abstain signals, rank-fused** | AUROC, Thai paraphrase vs near-miss | small gain only: best 0.60 vs shipped score 0.53; bge-m3 (a model per question) 0.85 (*unreviewed*) | `synth/007_signals_unreviewed.md` |
| **Thai word vocabulary instead of character trigrams** (ICU dictionary segmentation) | first-right, Thai held-out and official FAQ | worse: words alone 45.8% vs trigrams 53.8%; words + trigrams 54.2% (+0.4, noise); FAQ 84.5% vs 94.4%. The misses are meaning, not tokenisation | `synth/010_segment_vs_trigram.md` |
| **Distilled trigram -> bge-m3 map, English** | first-right, English held-out | worse in English: 43.9% -> 28.0% (only 1 English example per entry in training). Thai improved (53.4% -> 62.9%), so the idea is open, not lost: plan 010 item 3 re-runs it with a >= +10 point rule | `synth/005_distill_unreviewed.md` |
| **Thai number lexicon for the answer-type note** (Thai digits, number words) | for each entry, its own title + เท่าไร / กี่วัน / เมื่อไหร่: does a wrong "not stated" note come from a value written in Thai digits or words? | nothing to fix today: 0 of 215 notes (2026-11-09); 0 on the generated questions | `rules/type_lexicon_probe.mjs`, `synth/011_type_note_synth_unreviewed.md` (untracked as of 2026-11-09) |
| **Draft then verify: re-rank the trigram top-K with the distilled map** (katgpt `dd_tree`) | first-right on held-out paraphrases, eval52, FAQ, near-misses, retention; 5-fold CV for w | below the preregistered +10 Thai points: best shippable (128-d int8, top-5, 206 KB gzip) Thai 53.4% -> 59.5%, English 43.9% -> 49.2%, eval52 86% -> 88%, FAQ 94.4% -> 95.8%, near-miss 22.0% -> 21.6%, retained 0.991. Gains everywhere, so it is OPEN: re-run on a fresh reviewed set (*unreviewed*) | `synth/012_rerank_unreviewed.md` |

## Adding a row
- Only for a result that was measured (or rejected on a stated known result). Give the number against the shipped arm, not alone.
- Link the file that holds the run. If the labels are unreviewed, say so.
- A loser can come back when something material changes: write the change in the new run's header and link this row.
