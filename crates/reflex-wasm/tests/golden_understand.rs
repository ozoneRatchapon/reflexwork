//! Rust understand() vs the frozen JS outputs (benchmark/golden/understand.json). Run: cargo test -p reflex-wasm --test golden_understand
use reflex_wasm::understand::{understand, Hit};
use serde_json::Value;

/// JS prints 6 where serde prints 6.0: compare numbers by value.
fn canon(v: Value) -> Value {
    match v {
        Value::Number(n) => n.as_f64().map_or(Value::Number(n), |f| serde_json::json!(f)),
        Value::Array(a) => Value::Array(a.into_iter().map(canon).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, x)| (k, canon(x))).collect()),
        other => other,
    }
}

#[test]
fn understand_matches_js_on_every_case() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/understand.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let bad: Vec<String> = cases
        .iter()
        .filter_map(|c| {
            let phrases: Vec<String> = serde_json::from_value(c["phrases"].clone()).unwrap();
            let results: Vec<Vec<Hit>> = serde_json::from_value(c["results"].clone()).unwrap();
            let got = canon(serde_json::to_value(understand(&phrases, &results)).unwrap());
            (got != canon(c["out"].clone())).then(|| format!("{phrases:?}\n  want {}\n  got  {got}", c["out"]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cases.len(), bad.iter().take(4).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn no_phrases_is_none() {
    assert_eq!(serde_json::to_value(understand(&[], &[])).unwrap(), serde_json::json!({"kind": "none"}));
}
