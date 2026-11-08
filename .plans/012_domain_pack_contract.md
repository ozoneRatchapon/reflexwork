# 012 - Domain pack contract: a new domain is data plus a gate set, engine unchanged (2026-11-08)

Goal: any new domain (a second agency, a new KB for the same agency) is added as a pack directory and a gate set, with no change to
the Rust engine or the page logic. Plan 011 does the mechanics for the graduate school's own vocabulary; this plan defines what a pack
is, what it must pass, and how to tell whether the engine is still generic. It does not wait on the hospital data.

## Why now (measured 2026-11-08)
- Answer-type note (`benchmark/synth/011_type_note_synth_unreviewed.md`, shipped `missingTypes`, synth questions, source entry as candidate):
  - near-misses flagged **26.5%** (70 of 264);
  - Thai paraphrases flagged **2.5%** (13 of 528), English paraphrases **7.2%** (19 of 264);
  - 0 of the paraphrase flags are on entries with Thai digits or Thai number words, so a Thai lexicon (plan 010 item #8) would not fix any of them.
- The comment in `chatbot.html` still quotes the older 29.5% / 3.2%. Update it when the note changes, not before.
- Conclusion: the note's false flags come from something else (the entry states the value in another form, or the question asks a
  different value). The pack contract must carry a per-pack check for this, because a new domain will have its own wording.

## Pack contract (proposed)
A pack is a directory, one per agency or KB:
- `agency.json`: URLs, contacts, wording, and the `vocab` block from plan 011 step 1.
- `knowledge-index.json`: entries with `id`, `title`, `answer`, `source`.
- `synth/`: generated questions for that pack (same format as `benchmark/synth/questions_001.json`), plus its own review sheet.
- `golden/`: the route golden recorded from that pack's own page (plan 011: never reuse another pack's golden).

The engine (Rust `reflex-wasm`, search, gate, routing order, the answer-type rule) reads only the pack. It has no domain words of its own.

## Gate set (every pack must pass; a new pack is not accepted with any gate skipped)
1. `route_golden.mjs --check`: 0 differences on the pack's own golden.
2. `wasm_golden_check`: 0 differences.
3. `cargo test` green; `chat_e2e` green (`tests/chat_e2e.test.mjs`, per the page-boot memory).
4. Synth eval for the pack: first-right rate and the answer-type note split (paraphrase flags vs near-miss flags), as in `011_type_note_synth`.
   Report both numbers; the note must not fire on more than a stated share of answerable questions for that pack.
5. Engine-generic check: `rg` for the graduate-school words (the list from plan 011 inventory) under `reflex-wasm/src` returns only
   pack-loaded defaults, not literals in code paths. This check is a single command, run on every pack.

## Steps (each is a commit; gates above)
1. Write the pack loader: `Router` takes a pack. Depends on plan 011 steps 1-4 (vocab struct). No behaviour change for the graduate school.
2. Write the gate runner in Rust (a bin in the workspace, per the owner's 2026-11-08 rule): one command runs gates 1-5 for a named pack and writes a numbered result file. The existing Node measurement scripts stay as they are; new work does not extend them.
   - Status (2026-11-08): done as `crates/reflex-gate` (`cargo run -p reflex-gate -- --pack graduate-school`). Results go to `benchmark/gates/NNN_<pack>_<date>.md`. A skipped gate counts as not passing. Gate 3b reads the `SKIPPED:` line from `chat_e2e`, because that script exits 0 when it skips. Gate 4 is skipped until `packs/<pack>/synth/` exists. Gate 5 scans `reflex-wasm/src` against `crates/reflex-gate/words/graduate_school.txt`.
   - First run (2026-11-08, `benchmark/gates/001_graduate-school_2026-11-08.md`): gates 1, 2, 3a, 3b PASS; gate 4 SKIPPED (no pack synth dir); gate 5 FAIL with 267 hits in `reflex-wasm/src`. Verdict: NOT ACCEPTED, as expected for the current engine.
   - The logic of `benchmark/rules/type_note_synth.mjs` (the answer-type note measurement) is not ported yet. It is left as is, and it folds into the gate-4 measurement when the pack layout exists.
3. Fix the answer-type note's paraphrase flags for the graduate-school pack, measured by the gate-4 split. Start with the English
   paraphrases (7.2%). Hypothesis, not yet checked: "How many working days ..." matches only the count pattern (`how many`), not the
   duration pattern (which needs `how many days`), so the entry's day count does not satisfy it. Verify on the 19 flagged rows before
   changing any pattern. Owner review of those rows first, because the labels are the generator's.
4. Stub pack: a clearly marked invented pack (3-5 entries, no real data) that passes all five gates. This proves the contract.
5. Only after step 4: a real second pack, starting with the hospital (plan 011 owner inputs apply).

## Not in this plan
- The hospital data and its health-data rules (plan 011 "Hospital-specific risks").
- The NPC ecosystem (the separate experiment; its own folder and gates, not coupled to any pack).
- The Thai lexicon (plan 010 #8): dropped for now, since it fixes zero measured flags.

## Owner inputs needed
- Confirm the pack directory layout above, or give the layout you want.
- Confirm that the note's false-flag rate target for a pack is a number, and which number (the paraphrase share that is acceptable).
