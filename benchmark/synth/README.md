# Offline labelled questions (2026-11-07)

**Why.** The modelless plan (`.plans/006`) was stuck on step 1, because there are no labelled outcomes without real users. This folder makes labelled questions offline instead:
- A **local** model (gemma4:26b in Ollama) writes them; nothing leaves the machine.
- The chat itself is unchanged.
- A person must spot-check a sample before any number here is quoted (`review_001.tsv`).

**What was generated.** `questions_001.json`, 1,056 questions. For each of the 132 entries, `generate.mjs` wrote:
- 4 Thai paraphrases;
- 2 English questions;
- 2 near-misses: the same area, but NOT answered by that entry.

## Results (unreviewed labels: read as estimates)
| file | what |
|---|---|
| `001_eval_unreviewed.md` | shipped search + decideTier on the generated questions |
| `002_doc2query_unreviewed.md` | adding generated questions to the index (offline expansion, still modelless at run time) |
| `003_embed_bge-m3_unreviewed.md` | meaning-based search with bge-m3 (multilingual, 567M parameters, local) |
| `004_embed_nomic_unreviewed.md` | the same with nomic-embed-text (English-centred) |
| `005_distill_unreviewed.md` | bge-m3 distilled into a trigram -> vector map (offline ridge, no model at run time; katgpt-canon idea) |
| `006_answer_type_unreviewed.md` | answer-type match: does the entry contain the kind of value asked for |
| `007_signals_unreviewed.md` | AUROC of model-free abstain signals, rank-fused |
| `009_eval_claude_reviewed.md` | `001` re-run with `review_001_claude.tsv`: a second AI (Claude) read the 60 sampled rows. **3 of 60 labels were wrong (5%)**: a phone number the entry does not hold, a steps question for a time-plan entry, a "near-miss" the entry does answer (Certificate of Honor needs 8 skills). Dropping them moves no number by more than 0.2 points. It read each row against its own entry only: it did not search the whole manual for ANOTHER entry that answers a near-miss, and it is not the owner of the manual. A person should still fill `review_001.tsv`. |
| `008_distance_gate_unreviewed.md` | corpus-distance gate (Reflex idea): useless against near-misses, weak (0.64) against off-corpus questions |

What to take from katgpt-rs and why: `.plans/010_katgpt-adoption.md`.

### 1. The lexical search misses reworded questions
- On Thai paraphrases, the right entry is ranked first **52%** of the time. English gets 49%.
- Before, the old sets showed 84% (eval52) and 94% (official FAQ). But 62 entries were written from that FAQ, so the FAQ number measures matching, not understanding.
- 19% of the Thai paraphrases are answered with a wrong entry.
- 22% of the near-misses are answered with the very entry that does not answer them.

### 2. The lexical score cannot tell "answer" from "don't"
- AUROC of the lexical top score, paraphrase vs near-miss: **0.504**, the same as a coin flip.
- This explains `benchmark/abstain/001`: no threshold on that score fixed over-answering, because the score does not carry the information.

### 3. doc2query makes things worse
Both ways of adding generated questions hurt the held-out Thai questions and the old sets:
- in the keywords: 53% → 43%;
- as separate items: 53% → 34%.

So it is ruled out, and it matches the earlier finding that long keywords dilute the score.

### 4. Embeddings (bge-m3) help a lot on rewording
- Thai: 52% → **75%** first-right. English: 49% → **77%**.
- AUROC for answer-or-not: **0.85** using the similarity to the candidate entry, and 0.72 using the top-1 similarity.
- On the old sets, embeddings alone are slightly lower: 80% vs 84% on eval52, and 91.5% vs 94.4% on the FAQ.
- The hybrid (lexical when its score is 4 or more, otherwise embeddings) keeps both old sets: 88% eval52, 94.4% FAQ. It reaches 65% Thai / 61% English.
- nomic-embed-text is useless for Thai: 11%.

### Caveats (do not skip)
- **Labels are the model's.** About 25 misses were read by hand: most are real search misses, some are wrong labels. Fill `review_001.tsv` (60 rows), then rerun `eval.mjs`; it drops the bad rows and reports the review counts.
- **The model wrote the questions from the answer text.** That can favour embeddings, which match meaning close to that text. Real student questions are needed to confirm (pilot / gap log, with permission).
- **Only "first right" and AUROC are measured.** A threshold for the chat, and the effect on the full page (programme, follow-up and other branches), are not.

## Direction (not decided: owner's call)
Using embeddings in the chat means **a model per question at run time**. The chat would no longer be modelless.

Options:
- **(a) Embeddings on a server.**
  - The 132 entry vectors are computed offline; the question is embedded when it is asked.
  - Cloudflare Workers AI lists `@cf/baai/bge-m3`. Price, latency and Thai quality on Workers are **not checked**.
  - The question text then goes to that service, so PDPA has to be reviewed (as for the AI proxy today).
- **(b) Embeddings in the browser.**
  - A quantised bge-m3 is hundreds of MB, too heavy for phones.
  - A smaller multilingual model would need its own measurement.
- **(c) Stay lexical.**
  - Improve titles and keywords of the weak entries listed in `001_eval_unreviewed.md`.
  - Keep handing off when unsure.
  - Cheapest, but the 0.504 AUROC says the abstain problem stays.

Suggested order: fill the review sheet → if the numbers hold, try (a) behind a flag in the proxy, as a re-ranker and abstain signal only. Facts stay from the manual; the lexical path stays as the fallback.

## Re-run
```
node benchmark/synth/generate.mjs benchmark/synth/questions_001.json    # resumable; needs Ollama + gemma4:26b
node benchmark/synth/review.mjs                                          # writes review_001.tsv (never overwrites verdicts)
node benchmark/synth/eval.mjs benchmark/synth/questions_001.json benchmark/synth/review_001.tsv out.md
node benchmark/synth/doc2query.mjs benchmark/synth/questions_001.json out.md
node benchmark/synth/embed.mjs benchmark/synth/questions_001.json out.md --model bge-m3   # needs: ollama pull bge-m3
```
