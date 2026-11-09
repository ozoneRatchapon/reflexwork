# Abstain 002 - a certified bound on wrong answers per threshold (2026-11-09)

Plan 016 item 4 (katgpt-rs `certified_frontier.rs` `cp_upper`, plan 010 Second look D). Run: `cargo run -q --release -p reflex-bench --bin abstain_bound -- --write`.
Search and tier rule: the native twin of the shipped wasm (`reflex_wasm::kb_rank`, `decide::decide_tier`, gate 0.061 as in experiment 001).

**Preregistered (before the run):** G1 the shipped row on the reviewed set reproduces experiment 001's shipped row (keeps 96.1 %, answers negatives 53.0 %) within 1 point, else the harness is wrong and nothing below counts. G2 report, per threshold, the one-sided Clopper-Pearson upper bound (delta = 0.05) on "wrong among answered", and the lowest threshold whose bound is <= 10 % and <= 20 %. No adoption decision is tied to this file: it adds no score or gate (AUROC cannot change), it states what can be promised.

**Verdict:** G1 pass. The shipped rule's wrong rate among its answers is at most 24.9 % (95 %); no threshold 1-6 (the top score is at most 6) can promise <= 10 % on the reviewed set.

G1 check: shipped on the reviewed set keeps 96.2 % of right answers and answers 52.9 % of negatives (experiment 001: 96.1 % / 53.0 %).

### Reviewed questions (eval52 + official FAQ variants + not-in-manual + staff-only) (424 questions: 286 right-answer positives, 138 negatives)

| rule | answered | keeps right answers | answers when it should not | wrong among answered | upper bound (95 %) |
|---|---|---|---|---|---|
| **shipped tier rule** | 348 | 96.2 % | 52.9 % | 21.0 % | 24.9 % |
| top score >= 1 | 424 | 100.0 % | 100.0 % | 32.5 % | 36.5 % |
| top score >= 2 | 364 | 97.2 % | 62.3 % | 23.6 % | 27.6 % |
| top score >= 3 | 364 | 97.2 % | 62.3 % | 23.6 % | 27.6 % |
| top score >= 4 | 334 | 93.4 % | 48.6 % | 20.1 % | 24.0 % |
| top score >= 5 | 308 | 87.8 % | 41.3 % | 18.5 % | 22.5 % |
| top score >= 6 | 263 | 77.3 % | 30.4 % | 16.0 % | 20.2 % |

Lowest threshold whose bound is <= 10 %: none in 1-6

Lowest threshold whose bound is <= 20 %: none in 1-6

Shipped rule: of 348 answers, 73 wrong (21.0 %); with 95 % confidence the wrong rate on questions like these is at most **24.9 %**.

### Generated questions, labels NOT reviewed (synth/questions_001.json; near-misses count as should-not-answer) (1056 questions: 404 right-answer positives, 652 negatives)

| rule | answered | keeps right answers | answers when it should not | wrong among answered | upper bound (95 %) |
|---|---|---|---|---|---|
| **shipped tier rule** | 634 | 76.0 % | 50.2 % | 51.6 % | 54.9 % |
| top score >= 1 | 1056 | 100.0 % | 100.0 % | 61.7 % | 64.2 % |
| top score >= 2 | 702 | 80.2 % | 58.0 % | 53.8 % | 57.0 % |
| top score >= 3 | 702 | 80.2 % | 58.0 % | 53.8 % | 57.0 % |
| top score >= 4 | 578 | 73.3 % | 43.3 % | 48.8 % | 52.3 % |
| top score >= 5 | 502 | 68.1 % | 34.8 % | 45.2 % | 49.0 % |
| top score >= 6 | 376 | 58.2 % | 21.6 % | 37.5 % | 41.8 % |

Lowest threshold whose bound is <= 10 %: none in 1-6

Lowest threshold whose bound is <= 20 %: none in 1-6

Shipped rule: of 634 answers, 327 wrong (51.6 %); with 95 % confidence the wrong rate on questions like these is at most **54.9 %**.

## Reading
- "Wrong among answered" counts an answer as wrong when the top entry is not a gold entry, including every answer to a question the manual does not cover.
- The bound holds for questions drawn like these sets, not for live traffic; the reviewed set has 3 known label slips in 60 checked (synth 009) and the generated set is unreviewed.
- A higher threshold buys a smaller promise by answering less; the abstain separation itself (AUROC ~0.5-0.6) is unchanged.
