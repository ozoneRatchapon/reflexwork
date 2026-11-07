# doc2query experiment (offline question expansion, modelless at run time)

Questions: `questions_001.json`, unreviewed model labels. Split per entry: Thai paraphrases 0, 2 -> keywords; 1, 3 -> test.

| variant | Thai held-out: 1st right | answered wrong | English: 1st right | near-miss answered with its own entry | eval52: 1st right | official FAQ (th): 1st right |
|---|---|---|---|---|---|---|
| as shipped | 53.4% (141/264) | 17.4% | 48.5% | 22.0% | 84.0% (42/50) | 94.4% (67/71) |
| alias items (each paraphrase its own item, best item wins) | 33.7% (89/264) | 52.7% | 50.0% | 23.1% | 68.0% (34/50) | 88.7% (63/71) |
| doc2query (half the Thai paraphrases added to keywords) | 42.8% (113/264) | 29.9% | 51.5% | 18.2% | 76.0% (38/50) | 88.7% (63/71) |

Caveats: the held-out paraphrases come from the same model and prompt as the added ones (optimistic); labels are not reviewed yet; the eval52 / FAQ columns are the regression check.
