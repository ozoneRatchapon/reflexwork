//! Rust resolver vs the frozen JS outputs (benchmark/golden/resolve.json: 527 questions, strict and loose, over a frozen catalogue).
//! Run: cargo test -p reflex-wasm --test golden_resolve
use reflex_wasm::resolve::{Catalogue, Programme};
use serde_json::Value;

fn golden() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/resolve.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn catalogue(g: &Value) -> Catalogue {
    let programmes: Vec<Programme> = serde_json::from_value(g["catalogue"].clone()).unwrap();
    Catalogue::new(&programmes)
}

fn as_json(r: Option<reflex_wasm::resolve::Resolution>) -> Value {
    r.map_or(Value::Null, |x| serde_json::to_value(x).unwrap())
}

fn run(loose: bool) {
    let g = golden();
    let cat = catalogue(&g);
    let cases = g["cases"].as_array().unwrap();
    let key = if loose { "loose" } else { "out" };
    let bad: Vec<String> = cases
        .iter()
        .filter_map(|c| {
            let q = c["q"].as_str().unwrap();
            let got = as_json(cat.resolve(q, loose));
            (got != c[key]).then(|| format!("[{q}]\n  want {}\n  got  {got}", c[key]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ ({key}):\n{}", bad.len(), cases.len(), bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn strict_matches_js_on_every_question() {
    run(false);
}

#[test]
fn loose_matches_js_on_every_question() {
    run(true);
}
