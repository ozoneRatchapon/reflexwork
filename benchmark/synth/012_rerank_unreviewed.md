# 012 Draft then verify: re-rank the trigram top-K with the distilled map (2026-11-09, labels unreviewed)

**Verdict:** no arm passes the preregistered gate; nothing ships. See the tables for which condition each arm misses. (Reading, added by hand from the tables: every re-rank arm misses only the Thai +10 condition. The shippable 128-d top-5 arm gains in every set - Thai 53.4 -> 59.5 %, English 43.9 -> 49.2 %, eval52 86 -> 88 %, FAQ 94.4 -> 95.8 %, near-misses 22.0 -> 21.6 %, retained 0.991, 206 KB gzip - so it is the best candidate for the fresh, reviewed paraphrase set plan 010 item 3 asks for; the gate is not moved after the fact.)

Plan 016 item 11, plan 010 Second look A (katgpt-rs `dd_tree/tree_builder.rs`: the verifier only scores drafted candidates). Run: `cargo run -q --release -p reflex-bench --bin rerank -- --write` (needs the bge-m3 cache from `node benchmark/synth/embed.mjs --model bge-m3`).
Map: kernel ridge (lambda 0.1) from the shipped trigram set (`reflex_wasm::gram_set`) to bge-m3, trained on the 528 items of experiment 005 (entry texts + Thai paraphrases 0, 2 + English 0). Re-rank: among the search's top-K, highest cos_lex + w * cos_distilled; w from {0.25, 0.5, 1, 2, 4, 8, 16} chosen by 5-fold CV on the Thai + English held-out paraphrases (the fold being scored is never used to choose w); eval52 / FAQ / near-misses use the w chosen on all paraphrases.

**Preregistered gate (plan 010 A, written before this run):** Thai held-out first-right >= shipped + 10 points; English held-out, eval52 and FAQ not below shipped; near-misses answered with their own source entry <= 22.0 %; map <= 500 KB gzip; and (item 5) retained >= 0.95 of shipped's right answers on eval52 + FAQ with a net gain.


## 1024-d f64 (reference) (table 707 KB gzip)

| arm | w (all paraphrases) | Thai held-out (264) | English held-out (132) | eval52 (50) | FAQ Thai (71) | near-miss answered with its source (264) | retained on eval52+FAQ | gate |
|---|---|---|---|---|---|---|---|---|
| A shipped (trigram search) | - | 53.4 % | 43.9 % | 86.0 % | 94.4 % | 22.0 % | 1.000 (lost 0, gained 0) | (floor) |
| B distilled only | - | 62.9 % | 28.0 % | 74.0 % | 88.7 % | 14.4 % | 0.845 (lost 17, gained 7) | fail |
| D hybrid (A if score >= 4 else B) | - | 61.7 % | 42.4 % | 90.0 % | 93.0 % | 21.2 % | 0.982 (lost 2, gained 3) | fail |
| R re-rank top-3 | 0.5 | 59.1 % | 49.2 % | 86.0 % | 97.2 % | 21.2 % | 0.991 (lost 1, gained 3) | fail |
| R re-rank top-5 | 0.5 | 60.6 % | 50.0 % | 86.0 % | 97.2 % | 21.2 % | 0.991 (lost 1, gained 3) | fail |
| R re-rank top-10 | 2 | 61.4 % | 50.0 % | 84.0 % | 98.6 % | 19.3 % | 0.973 (lost 3, gained 5) | fail |

## 128-d projection, int8 (shippable) (table 206 KB gzip)

| arm | w (all paraphrases) | Thai held-out (264) | English held-out (132) | eval52 (50) | FAQ Thai (71) | near-miss answered with its source (264) | retained on eval52+FAQ | gate |
|---|---|---|---|---|---|---|---|---|
| A shipped (trigram search) | - | 53.4 % | 43.9 % | 86.0 % | 94.4 % | 22.0 % | 1.000 (lost 0, gained 0) | (floor) |
| B distilled only | - | 48.5 % | 20.5 % | 56.0 % | 85.9 % | 15.9 % | 0.773 (lost 25, gained 4) | fail |
| D hybrid (A if score >= 4 else B) | - | 54.5 % | 36.4 % | 84.0 % | 94.4 % | 21.2 % | 0.982 (lost 2, gained 1) | fail |
| R re-rank top-3 | 1 | 57.2 % | 46.2 % | 84.0 % | 95.8 % | 20.8 % | 0.973 (lost 3, gained 3) | fail |
| R re-rank top-5 | 0.5 | 59.5 % | 49.2 % | 88.0 % | 95.8 % | 21.6 % | 0.991 (lost 1, gained 3) | fail |
| R re-rank top-10 | 0.5 | 59.8 % | 48.5 % | 88.0 % | 95.8 % | 21.6 % | 0.991 (lost 1, gained 3) | fail |

## Reading
- "Near-miss answered with its source": the shipped tier rule answers (`act`, lexical scores) and the arm's top entry is the near-miss's source entry (the generated near-miss asks something that entry does not say).
- Same train / held-out split as experiment 005; English has one training example per entry. Not a fresh question set: plan 010 item 3 still asks for one before anything ships.
