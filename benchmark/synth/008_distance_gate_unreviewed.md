# Corpus-distance gate on generated questions (unreviewed labels)

Exemplars per entry: its text + train paraphrases. Test: 264 held-out Thai paraphrases vs 264 near-misses. AUROC, 0.5 = no separation.

**All test questions**

| signal | AUROC |
|---|---|
| lexical score s1 (shipped) | 0.502 |
| D_all: nearest exemplar anywhere (Reflex-style) | 0.471 |
| D_top: nearest exemplar of the top-1 entry | 0.503 |
| D_gap: D_top minus nearest other entry | 0.536 |

**Only where the top-1 entry is the source entry** (the case where the bot would give that entry; 141 vs 78)

| signal | AUROC |
|---|---|
| lexical score s1 (shipped) | 0.532 |
| D_all: nearest exemplar anywhere (Reflex-style) | 0.501 |
| D_top: nearest exemplar of the top-1 entry | 0.493 |
| D_gap: D_top minus nearest other entry | 0.521 |

**Off-corpus questions** (44 official FAQ items the manual does not cover + 2 off-corpus eval queries) vs the 264 held-out paraphrases

| signal | AUROC |
|---|---|
| lexical score s1 (shipped) | 0.517 |
| D_all: nearest exemplar anywhere (Reflex-style) | 0.642 |
| D_top: nearest exemplar of the top-1 entry | 0.527 |
| D_gap: D_top minus nearest other entry | 0.375 |

For reference: bge-m3 similarity to the entry 0.850 (003, needs a model); best earlier model-free fusion ~0.60 (007).
