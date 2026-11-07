# Model-free abstain signals: AUROC (Thai paraphrase vs near-miss, when the source entry is ranked 1st)

n = 276 paraphrases vs 78 near-misses (unreviewed labels). 0.5 = no separation. For reference: bge-m3 similarity to the entry 0.850 (003, needs a model).

| signal | AUROC |
|---|---|
| lexical score s1 (shipped) | 0.532 |
| score margin s1-s2 | 0.571 |
| cosine c1 | 0.484 |
| cosine margin c1-c2 | 0.569 |
| answer-type match (0/1) | 0.594 |
| rank fusion: c1 + answer-type | 0.581 |
| rank fusion: c1 + cos margin + answer-type | 0.598 |
