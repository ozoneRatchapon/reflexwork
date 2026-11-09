# Gate result: graduate-school (2026-11-08)

| gate | status | detail |
|---|---|---|
| 1 route_golden | PASS | exit 0 |
| 2 wasm_golden | PASS | exit 0 |
| 3a cargo_test | PASS | exit 0 |
| 3b chat_e2e | PASS | exit 0 |
| 4 synth_eval | SKIPPED | ./packs/graduate-school/synth not found: the pack layout (plan 012) is not created, so nothing was measured |
| 5 engine_generic | FAIL | 217 hits (+197 more): crates/reflex-wasm/src/answer/slot.rs:15 `ค่าธรรมเนียม`, crates/reflex-wasm/src/catalogue/fee.rs:37 `ค่าธรรมเนียม`, crates/reflex-wasm/src/catalogue/fee.rs:40 `ค่าธรรมเนียม`, crates/reflex-wasm/src/catalogue/fee.rs:45 `นักศึกษา`, crates/reflex-wasm/src/catalogue/mod.rs:1 `programme`, crates/reflex-wasm/src/catalogue/schedule.rs:32 `รอบ`, crates/reflex-wasm/src/catalogue/schedule.rs:34 `รอบ`, crates/reflex-wasm/src/catalogue/schedule.rs:51 `รอบ`, crates/reflex-wasm/src/intake/patterns_src.rs:8 `นักศึกษา`, crates/reflex-wasm/src/intake/patterns_src.rs:12 `ค่าธรรมเนียม`, crates/reflex-wasm/src/intake/patterns_src.rs:12 `ปริญญา`, crates/reflex-wasm/src/intake/patterns_src.rs:12 `รอบ`, crates/reflex-wasm/src/lib.rs:526 `เทอม`, crates/reflex-wasm/src/lib.rs:620 `programme`, crates/reflex-wasm/src/lib.rs:626 `programme`, crates/reflex-wasm/src/lib.rs:632 `programme`, crates/reflex-wasm/src/lib.rs:640 `programme`, crates/reflex-wasm/src/lib.rs:642 `programme`, crates/reflex-wasm/src/lib.rs:643 `programme`, crates/reflex-wasm/src/lib.rs:653 `programme` |

**Verdict:** NOT ACCEPTED: at least one gate is failed or skipped.
