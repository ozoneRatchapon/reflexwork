//! Rust intake logic vs the frozen JS outputs (benchmark/golden/intake.json). Run: cargo test -p reflex-wasm --test golden_intake
use reflex_wasm::intake::{classify_issue, is_advice, is_english};
use serde_json::Value;

#[test]
fn intake_matches_js_on_every_text() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/intake.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut bad = Vec::new();
    for c in &cases {
        let t = c["text"].as_str().unwrap();
        let issue = serde_json::to_value(classify_issue(t)).unwrap();
        for (name, got, want) in [("issue", issue, c["issue"].clone()), ("advice", is_advice(t).into(), c["advice"].clone()), ("english", is_english(t).into(), c["english"].clone())] {
            if got != want {
                bad.push(format!("{name} {t:?}: want {want} got {got}"));
            }
        }
    }
    assert!(bad.is_empty(), "{} differ over {} texts:\n{}", bad.len(), cases.len(), bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
}
