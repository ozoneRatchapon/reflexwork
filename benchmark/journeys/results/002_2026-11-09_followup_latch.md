# Journeys 002 - follow-ups keep the right programme? (2026-11-09, dialogues unreviewed)

**Verdict:** the shipped order never answered about the wrong programme (0 of 102 programme answers); a latch has nothing to halve on these dialogues, so it is NOT built (plan 010 C gate: wrong-programme rate at least halved). Missed follow-ups: 0 of 102 turns that mean a programme.

Plan 016 item 12, plan 010 C (katgpt `pick_latch.rs`). Run: `cargo run -q --release -p reflex-bench --bin followup -- --write`. The Rust decision order (`decide_route`) with the programme in focus carried from turn to turn, AI off, catalogue loaded. 36 dialogues, 126 turns: 6 templates x 6 programme pairs (programmes whose title alone opens their card, spread over the catalogue). The dialogues are in `benchmark/journeys/followup_dialogues_001.json`; the expected programme of each turn is the author's reading, not reviewed by a person.

**Preregistered (plan 010 C):** build the latch only if it at least halves the wrong-programme rate and `route_rust_check` keeps >= 2100 singles.

| template | turns | about the wrong programme | a programme was meant, none used |
|---|---|---|---|
| follow-ups | 24 | 0 | 0 |
| switch | 24 | 0 | 0 |
| manual aside | 18 | 0 | 0 |
| thanks aside | 18 | 0 | 0 |
| restart | 18 | 0 | 0 |
| switch back | 24 | 0 | 0 |
| **all** | 126 | **0** of 102 programme answers | 0 of 102 |

Negative control: scored against the other programme of each pair, 102 of 102 programme answers count as wrong (the metric does see a failure).
