# 006 - The modelless NPC: what we have, what the experiment says, what next (2026-11-06)

"NPC" here means katgpt-rs's meaning: a deterministic, **modelless** agent - no training, no backprop, no LLM in the loop; state and adaptation by frozen kernels,
online EMA / Bayesian updates and calibration, with BLAKE3-committed snapshots (`katgpt-personality`, `katgpt-micro-belief`, `katgpt-sense` BAKE update,
`katgpt-extract/temper.rs` abstention gate). An earlier answer in chat compared ReflexWork with an LLM-brained NPC; that framing was wrong.

## What ReflexWork has today (honest map)
| katgpt idea | where it is here | state |
|---|---|---|
| personality-weighted composition (signed weights, sigmoid gate, never softmax) | smalltalk / intent scoring (`_shared/smalltalk.mjs`, chatbot.html) | used; weights hand-set |
| affect / mood | `MOOD` in chatbot.html | used for TONE only |
| reward-surprise EMA (bandit) | `BANDIT` (page note) and `entry_conf` EMA in kernel-worker (votes) | collects data and flags weak entries for staff; **effect on answer quality not measured** |
| belief state | `PCTX` (the programme in focus), `PIN`, restored with the chat | hand-coded single slot; follow-up bugs came from here |
| calibrated abstention (Temper) | `decideTier` fixed thresholds | NOT calibrated; see experiment |
| deterministic replay / commitment | BLAKE3 over question + route + category | a fingerprint, not a proof; does not cover the answer |

## Experiment (`benchmark/abstain/001_2026-11-06.md`)
- A Temper-style calibrated abstain gate does NOT beat the shipped thresholds (answers on negatives 59-65 % vs 50-53 % at equal recall); a logistic fit over all existing signals only ties.
- A new signal - idf-weighted share of the question the top entry explains - lowers answering on negatives to ~43-44 % (about -6 points). A lead, not a result (about 130 negatives, 62 KB entries written from the FAQ that supplies positives).
- So the next gains are **signals and labelled outcomes**, not a smarter threshold.

## Next, in order (all modelless; nothing here before the 2026-11-07 pitch)
1. **Outcome log + labelled set.** Record per answered question: served entry id, action (act / ask / hand-off), vote, and the staff label when the gap is closed. No raw text beyond the existing scrubbed gap text. This is Temper's "residual pools re-fitted from realised outcomes" and the missing input for everything below. Done when: a script builds a labelled set (positives / negatives) from the log and `benchmark/abstain/experiment.mjs` can read it.
2. **Coverage signal in the abstain decision.** Add query-coverage (idf-weighted) and a content-term check (a question term the entry does not explain), in JS and Rust, change the golden contract on purpose, re-measure on the larger labelled set. Done when: negatives answered drops by a margin larger than the standard error at equal recall, and the e2e + golden checks pass.
3. **Calibration as data.** Thresholds / spreads live in a versioned `calibration.json` (BLAKE3 commit, reviewed diff, rollback) re-fitted offline from the outcome log; both engines read it. Learning = a reviewed data change, never a silent runtime change.
4. **Belief state for follow-ups.** Generalise `PCTX` into a few deterministic slots (programme, level, year/term, topic) with decay and the existing undo; cover with e2e scenarios (the "แล้วค่าเทอมล่ะ" regression is the model case).
5. **Close the vote loop carefully.** Use per-entry confidence to rank staff review (already shown) and, only after A/B evidence and with a minimum vote count and reset on edit, to demote chronically downvoted entries.
6. **Staff-side planner.** Cluster near-duplicate gaps (trigram), rank by hits x recency, one draft per cluster; assign to owners by capacity (katgpt-assign is a candidate - not evaluated). This attacks the real bottleneck: content owners.

## Not doing
An LLM as the brain or the judge; publishing without a human approval; personal data without sign-in and PDPA (`.plans/004`); personality beyond tone.

## How we will know it works
Answering on negatives down at equal recall (`benchmark/abstain`), the follow-up scenarios green in `tests/chat_e2e.test.mjs`, median time from a gap to a live answer, gap backlog size.

## Where this is developed (2026-11-06)
Branch `feature/modelless-npc`; try it at the preview `https://modelless-npc.reflexwork.pages.dev` (no production backend by default; see `docs/dev-preview.md`). Production only changes with `deploy_pages.sh main`, after the pitch.
First task on this branch: step 1 (outcome log + labelled set). Also open: the 14 FAQ drafts (`docs/kb-faq-drafts/`) - approving them raw moves 14 answers to right but makes some existing ones wrong (measured); a conflict review by the owner is needed first.
