//! `dated_picks` vs the page's `datedPicks` (benchmark/golden/dated_picks.json, scripts/dump_route_text_golden.mjs): the same dated schedule entries of the
//! published manual, nearest to "today" first, for each intent on 11 different days (before, inside and after the schedules).
//! Run: cargo test -p reflex-wasm --test dated_picks
use reflex_wasm::route::dates::{dated_picks, PickState, TimeIntent};
use reflex_wasm::route::ManualEntry;
use serde_json::Value;

fn entries() -> Vec<ManualEntry> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/knowledge-index.json");
    let kb: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|_| panic!("{path} is missing: run python3 submissions/build_knowledge_index.py"))).unwrap();
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
        .collect()
}

#[test]
fn dated_picks_match_the_page_on_every_day_and_intent() {
    let kb = entries();
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/dated_picks.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut bad = Vec::new();
    for c in &cases {
        let intent = match c["intent"].as_str().unwrap() {
            "registration" => TimeIntent::Registration,
            "admissions" => TimeIntent::Admissions,
            _ => TimeIntent::Any,
        };
        let today = c["today"].as_str().unwrap();
        let got: Vec<Value> = dated_picks(&kb, intent, today)
            .iter()
            .map(|(e, st)| serde_json::json!([e.id, match st { PickState::Now => "now", PickState::Ahead => "ahead", PickState::Passed => "passed" }]))
            .collect();
        if Value::Array(got.clone()) != c["picks"] {
            bad.push(format!("{} on {today}: page {} rust {}", c["intent"], c["picks"], Value::Array(got)));
        }
    }
    assert_eq!(cases.len(), 33, "the golden should hold 3 intents x 11 days");
    assert!(bad.is_empty(), "{} differ:\n{}", bad.len(), bad.join("\n"));
}
