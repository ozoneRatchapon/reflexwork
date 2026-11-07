//! The scope guard vs the page's own `scopeClarify` / `scopeYears` / `scopeOf` (benchmark/golden/scope.json, scripts/dump_route_text_golden.mjs):
//! every recorded question, raw and term-normalised, with the page's search over the published manual as the ranked list.
//! Run: cargo test -p reflex-wasm --test scope
use reflex_wasm::route::scope::{scope_clarify, scope_of, scope_years, Ranked, Scope};
use reflex_wasm::route::{Manual, ManualEntry};
use serde_json::Value;

fn manual() -> Manual {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/knowledge-index.json");
    let kb: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|_| panic!("{path} is missing: run python3 submissions/build_knowledge_index.py"))).unwrap();
    Manual::new(
        kb.iter()
            .map(|e| ManualEntry {
                id: e["id"].as_str().unwrap().into(),
                title: e["title"].as_str().unwrap().into(),
                keywords: e["keywords"].as_str().unwrap().into(),
                staff: false,
                category: e["category"].as_str().unwrap_or("").into(),
                answer: e["answer"].as_str().unwrap_or("").into(),
                academic_year: e["academic_year"].as_str().map(String::from),
                semester: e["semester"].as_str().map(String::from),
            })
            .collect(),
    )
}

#[test]
fn scope_guard_matches_the_page() {
    let manual = manual();
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/scope.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let (mut bad, mut with_result) = (Vec::new(), 0);
    for c in &cases {
        let q = c["q"].as_str().unwrap();
        let found = manual.search(q);
        let ranked: Vec<Ranked> = found.iter().map(|f| Ranked { entry: f.entry, s: f.hit.s }).collect();
        let got = scope_clarify(q, &ranked, manual.entries());
        let (kind, axis, ids): (Value, Value, Value) = match &got {
            None => (Value::Null, Value::Null, Value::Null),
            Some(Scope::Ask { axis, candidates }) => ("ask".into(), (*axis).into(), serde_json::json!(candidates)),
            Some(Scope::Pick(id)) => ("pick".into(), Value::Null, serde_json::json!([id])),
            Some(Scope::NoYear) => ("no_year".into(), Value::Null, Value::Null),
            Some(Scope::NoRound) => ("no_round".into(), Value::Null, Value::Null),
        };
        with_result += usize::from(got.is_some());
        let (y, (so_y, so_t)) = (scope_years(q), scope_of(q));
        let checks = [("kind", &c["kind"], &kind), ("axis", &c["axis"], &axis), ("ids", &c["ids"], &ids)];
        for (name, want, have) in checks {
            if want != have {
                bad.push(format!("{name} {q:?}: page {want} rust {have}"));
            }
        }
        if serde_json::json!(y) != c["years"] {
            bad.push(format!("years {q:?}: page {} rust {y:?}", c["years"]));
        }
        if serde_json::json!([so_y, so_t]) != c["scopeOf"].as_object().map_or(Value::Null, |o| serde_json::json!([o["year"], o["term"]])) {
            bad.push(format!("scopeOf {q:?}: page {} rust [{so_y:?}, {so_t:?}]", c["scopeOf"]));
        }
    }
    assert!(cases.len() > 2000, "contract looks truncated: {}", cases.len());
    assert!(with_result >= 60, "too few cases with a scope result: {with_result}");
    assert!(bad.is_empty(), "{} differ over {} cases:\n{}", bad.len(), cases.len(), bad.iter().take(12).cloned().collect::<Vec<_>>().join("\n"));
}
