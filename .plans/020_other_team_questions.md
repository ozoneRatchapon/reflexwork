# 020 - The other team's GradMahidol AI test questions on our engine (2026-11-21)

Source: the other team's status report of 30/09/69 (LLM agent on openrouter/free, KB of semester 1 / 2569 registration, a LINE
ticket plan on Google Sheets + Apps Script). Their screenshots: "ลงทะเบียนล่าช้ามีค่าปรับไหม" (facts right: 3-14 Aug 2569,
2,000 baht, 27 Aug 22.00, but no term question) and a scholarship-announcement list.

## Their 6 kinds of question on our engine (ai off, 2026-11-21)
| question | before | after this plan |
|---|---|---|
| add drop ภาคต้น 2569 ถึงวันไหน | right (gm_registration_2569) | same |
| คุณทราบประกาศเกี่ยวกับทุนของบัณฑิตวิทยาลัยไหมครับ | offers scholarship_types, contact_line, **purchase_methods** | same (open) |
| ลงทะเบียนล่าช้ามีค่าปรับไหม | **wrong**: thesis_late_penalty | same (open) |
| ถอน W ได้ถึงวันไหน | not found (the 6 registration entries hold it) | same (open) |
| วันประกาศผลสอบ | **wrong**: gm_military_deferment_directory_2570 (no entry has results dates) | same (open) |
| เกรดผมออกยัง | not found | **personal** (fixed) |

## Done
- [x] `pers_statusq` (packs/graduate-school/vocab.json, the engine's default vocab) gets `ออก(?:แล้ว)?ยัง|ยังไม่ออก`: "เกรดผมออกยัง",
      "ผลสอบของหนูออกแล้วยัง" -> personal. 0 of 2177 Graduate School decisions changed (route + entry + offered, old vs new wasm),
      route_rust_check 2221/2221, music and library-demo pack goldens 0 differences. Test: `tests/route_predicates.rs`.
- [x] Tried and not kept (rows in `benchmark/NEGATIVE_RESULTS.md`): section headings as search items (58 / 12 changes, mostly worse)
      and withdrawal / late-registration words on the registration keyword lines (36 changes, mostly worse). Both hit the known
      TF-IDF dilution: a word shared by many entries counts less, so fixing one question breaks others.

- [x] Found on the way (from PR #152): `route_golden.mjs --check` exited 1 on "สมัคร 2101D04G" not in the golden. Its pool takes
      questions from `resolve.json` (a frozen catalogue, so the old code is right there); #152 had swapped the golden row to 2101D05G
      by hand. Now the pool also probes "สมัคร 2101D05G" (`PROGRAMME_PROBES`) and the golden has both (04G -> unsure_programme,
      05G -> programme_card): 2269 checked, 0 differences, 0 not in golden. `--update` was not kept: it also relabels 24 rows' `set`.

## Open
- [ ] The 3 open misses are retrieval limits, not missing data (except results dates). Options, none ours alone:
      the run-time embedding decision (plan 009 D: bge-m3, Thai 52% -> 75% first-right, owner), or the other team's LLM as the
      fallback when our engine does not answer (below).
- [ ] Ask the other team for their test questions (owner sends; draft in the 2026-11-21 reply). Add them to the golden pool once
      reviewed, like the official FAQ.
- [ ] Proposal to the other team (owner decides): our engine first (manual text, 0 tokens, no guessing), their LLM only on a not-found;
      their ticket flow as the hand-off. PDPA: student id + LINE userId in Google Sheets needs the DPO review (O5).
