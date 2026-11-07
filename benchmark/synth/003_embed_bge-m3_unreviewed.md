# Embedding experiment (bge-m3, local)

Questions: `questions_001.json` (unreviewed model labels) + the 52-query eval + official FAQ th. "1st right" = the top entry is the gold one.

| set | lexical (shipped) | embeddings alone | lexical top 10 re-ranked by embeddings | hybrid: lexical if score >= 4, else embeddings | rank fusion (RRF) |
|---|---|---|---|---|---|
| para_th | 52.3% (276/528) | 75.2% (397/528) | 70.5% (372/528) | 65.2% (344/528) | 65.2% (344/528) |
| para_en | 48.5% (128/264) | 76.5% (202/264) | 67.8% (179/264) | 61.4% (162/264) | 62.9% (166/264) |
| eval52 | 84.0% (42/50) | 80.0% (40/50) | 80.0% (40/50) | 88.0% (44/50) | 84.0% (42/50) |
| faq_th | 94.4% (67/71) | 91.5% (65/71) | 91.5% (65/71) | 94.4% (67/71) | 95.8% (68/71) |

**Answer or not (Thai paraphrase vs near-miss of the same entry, 528 vs 264):** AUROC of the embedding similarity to that entry = 0.850 (0.5 = no separation, 1 = perfect). Top-1 similarity, any entry: 0.719; lexical top score: 0.504.

Only "1st right" is measured here; whether the chat should ANSWER (abstain on near-misses) is not, and a run-time model per question is a direction change.
