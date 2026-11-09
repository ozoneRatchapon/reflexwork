# Distilling bge-m3 into a model-free trigram map (offline ridge; katgpt-canon source_adapter idea)

**Verdict** (added 2026-11-09, plan 010 item 6, from this file's own numbers; no gates were preregistered for this run): the distilled map beats shipped on Thai held-out (62.9% vs 53.4% at lambda 0.1) but loses in English (28.0% vs 43.9%), on eval52 (74% vs 84%) and the FAQ (88.7% vs 94.4%); the hybrid D gives eval52 +4 pp, FAQ -1.4 pp. Below the >= +10 point bar; open as plan 010 item 3. Labels unreviewed.

Train 528 items (132 entry texts + Thai paraphrases 0, 2 + English 0). Labels unreviewed. Test sets never used in training.
A = shipped lexical; B = distilled vector (trigrams -> bge-m3 space, cosine to entry vectors); C = trigram linear classifier (one-hot target); D = A if lexical score >= 4 else B; E = real bge-m3 per question (needs a model).

| λ | set | n | A lexical | B distilled | C classifier | D hybrid A/B | E bge-m3 (ceiling) |
|---|---|---|---|---|---|---|---|
| 0.1 | th_heldout | 264 | 53.4% | 62.9% | 43.9% | 61.7% | 74.2% |
| 0.1 | en_heldout | 132 | 43.9% | 28.0% | 23.5% | 42.4% | 72.0% |
| 0.1 | eval52 | 50 | 84.0% | 74.0% | 70.0% | 88.0% | 80.0% |
| 0.1 | faq_th | 71 | 94.4% | 88.7% | 87.3% | 93.0% | 91.5% |
| 0.3 | th_heldout | 264 | 53.4% | 60.2% | 44.3% | 60.6% | 74.2% |
| 0.3 | en_heldout | 132 | 43.9% | 25.8% | 27.3% | 42.4% | 72.0% |
| 0.3 | eval52 | 50 | 84.0% | 74.0% | 70.0% | 88.0% | 80.0% |
| 0.3 | faq_th | 71 | 94.4% | 88.7% | 88.7% | 93.0% | 91.5% |
| 1 | th_heldout | 264 | 53.4% | 51.9% | 45.1% | 54.9% | 74.2% |
| 1 | en_heldout | 132 | 43.9% | 21.2% | 27.3% | 38.6% | 72.0% |
| 1 | eval52 | 50 | 84.0% | 72.0% | 72.0% | 90.0% | 80.0% |
| 1 | faq_th | 71 | 94.4% | 88.7% | 88.7% | 93.0% | 91.5% |

Caveat: the held-out paraphrases come from the same model and prompt as the training ones (optimistic for B/C); eval52 / FAQ are the out-of-distribution check.
