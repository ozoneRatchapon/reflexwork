# Thai word vocabulary (ICU dictionary segmentation) vs character trigrams, first-right

Only the feature changes; the cosine arms share one scoring. Labels of the generated questions are unreviewed.

| arm | Thai paraphrases (held-out half) | English paraphrases | eval52 | official FAQ (th) |
|---|---|---|---|---|
| shipped search (control) | 53.4% (141/264) | 48.5% (128/264) | 84.0% (42/50) | 94.4% (67/71) |
| trigram (cosine only) | 53.8% (142/264) | 48.5% (128/264) | 84.0% (42/50) | 94.4% (67/71) |
| words (cosine only) | 45.8% (121/264) | 46.2% (122/264) | 82.0% (41/50) | 84.5% (60/71) |
| words+trigram (cosine only) | 54.2% (143/264) | 49.6% (131/264) | 84.0% (42/50) | 94.4% (67/71) |
| words+bigram (cosine only) | 50.4% (133/264) | 45.1% (119/264) | 74.0% (37/50) | 87.3% (62/71) |

Segmenter: Intl.Segmenter('th'), Node v24.16.0, ICU 78.3. It splits "ใบรับรอง" as "ใบรับ | รอง": a dictionary is only as good as its entries for THIS domain.
