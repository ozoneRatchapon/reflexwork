# Embedding experiment (nomic-embed-text, local)

Questions: `questions_001.json` (unreviewed model labels) + the 52-query eval + official FAQ th. "1st right" = the top entry is the gold one.

| set | lexical (shipped) | embeddings alone | lexical top 10 re-ranked by embeddings | hybrid: lexical if score >= 4, else embeddings | rank fusion (RRF) |
|---|---|---|---|---|---|
| para_th | 52.3% (276/528) | 11.4% (60/528) | 18.6% (98/528) | 42.8% (226/528) | 23.7% (125/528) |
| para_en | 48.5% (128/264) | 20.1% (53/264) | 23.1% (61/264) | 48.1% (127/264) | 29.9% (79/264) |
| eval52 | 84.0% (42/50) | 20.0% (10/50) | 36.0% (18/50) | 84.0% (42/50) | 48.0% (24/50) |
| faq_th | 94.4% (67/71) | 18.3% (13/71) | 35.2% (25/71) | 93.0% (66/71) | 40.8% (29/71) |

**Answer or not (Thai paraphrase vs near-miss of the same entry, 528 vs 264):** AUROC of the embedding similarity to that entry = 0.516 (0.5 = no separation, 1 = perfect). Top-1 similarity, any entry: 0.512; lexical top score: 0.504.

Only "1st right" is measured here; whether the chat should ANSWER (abstain on near-misses) is not, and a run-time model per question is a direction change.
