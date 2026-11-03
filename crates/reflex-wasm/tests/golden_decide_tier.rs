//! Rust port vs the frozen JS outputs (benchmark/golden/decide_tier.json). Run: cargo test -p reflex-wasm --test golden_decide_tier
use reflex_wasm::decide::{decide_tier, Action, Stage};
use serde_json::Value;

#[test]
fn decide_tier_matches_js_on_every_case() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/decide_tier.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let bad: Vec<String> = cases
        .iter()
        .filter_map(|c| {
            let scores: Vec<f64> = serde_json::from_value(c["scores"].clone()).unwrap();
            let got = serde_json::to_value(decide_tier(c["gate"].as_f64(), &scores)).unwrap();
            (got != c["out"]).then(|| format!("gate {} scores {:?}: want {} got {got}", c["gate"], scores, c["out"]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cases.len(), bad.join("\n"));
}

#[test]
fn no_gate_and_no_hits_escalate() {
    let v = decide_tier(None, &[]);
    assert_eq!((v.action, v.stage), (Action::Escalate, Stage::Rethink));
}
