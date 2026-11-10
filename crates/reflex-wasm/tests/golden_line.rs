//! The LINE contract (plan 009 C4): what the shared Router decides for the LINE worker's state - no programme catalogue, no tapped topic,
//! no programme in focus, the AI on, no AI rewrite - for every single question of the route pool (benchmark/golden/route.json).
//! The LINE worker renders from this decision alone (integrations/line-worker/views.mjs), so a change here is a change of LINE's replies.
//!   check:  cargo test -p reflex-wasm --test golden_line
//!   record: LINE_GOLDEN_WRITE=1 cargo test -p reflex-wasm --test golden_line   (after a deliberate change of the order or the manual)
use reflex_wasm::route::router::{decide, StateIn};
use reflex_wasm::route::{Manual, ManualEntry};
use serde_json::{json, Value};
use std::collections::BTreeSet;

/// The day the contract is decided on (as golden_route.rs: which dated entries exist, not which day it is, picks the route).
const TODAY: &str = "2026-11-07";
const GOLDEN: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/line_route.json");

/// The routes the LINE state can never reach: they need the catalogue, a tapped topic or the AI rewrite.
const UNREACHABLE: &[&str] = &[
    "catalogue_not_ready", "generic_fee", "programme_card", "programme_pick", "field_fee", "free_study", "career", "finder", "followup",
    "free_fee", "unsure_programme", "tuition_finder_nomatch", "understood_by_ai",
];

fn manual() -> Manual {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/knowledge-index.json");
    let raw = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("{path} is missing: run python3 submissions/build_knowledge_index.py"));
    let kb: Vec<Value> = serde_json::from_str(&raw).unwrap();
    let s = |e: &Value, k: &str| e[k].as_str().unwrap_or("").to_string();
    Manual::new(
        kb.iter()
            .map(|e| ManualEntry {
                id: s(e, "id"),
                title: s(e, "title"),
                keywords: s(e, "keywords"),
                staff: false,
                category: s(e, "category"),
                answer: s(e, "answer"),
                academic_year: e["academic_year"].as_str().map(String::from),
                semester: e["semester"].as_str().map(String::from),
            })
            .collect(),
    )
}

/// The questions: every distinct single question of the route pool, in pool order.
fn questions() -> Vec<String> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/route.json");
    let all: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut seen = BTreeSet::new();
    all.iter()
        .filter(|r| r["kind"] == "single")
        .filter_map(|r| r["q"].as_str())
        .filter(|q| seen.insert(q.to_string()))
        .map(String::from)
        .collect()
}

fn line_state() -> StateIn {
    StateIn { prog_state: "none".into(), ai_off: false, pinned_id: None, programme_in_focus: None, today: TODAY.into(), agency_has_it: true }
}

/// One recorded row: the question and the decision's non-null fields (route `null` = LINE's "not found").
fn row(q: &str, manual: &Manual) -> Value {
    let d = decide(q, &line_state(), manual, None, None).unwrap();
    let mut v = serde_json::to_value(&d).unwrap();
    let obj = v.as_object_mut().unwrap();
    obj.retain(|k, x| k == "route" || !x.is_null());
    let mut out = json!({ "q": q });
    out.as_object_mut().unwrap().extend(obj.clone());
    out
}

#[test]
fn line_decisions_match_the_recorded_contract() {
    let manual = manual();
    let got: Vec<Value> = questions().iter().map(|q| row(q, &manual)).collect();
    let reached: Vec<&str> = got.iter().filter_map(|r| r["route"].as_str()).filter(|r| UNREACHABLE.contains(r)).collect();
    assert!(reached.is_empty(), "LINE reached routes it cannot show: {reached:?}");
    if std::env::var_os("LINE_GOLDEN_WRITE").is_some() {
        std::fs::write(GOLDEN, serde_json::to_string_pretty(&got).unwrap() + "\n").unwrap();
        eprintln!("wrote {GOLDEN} ({} questions)", got.len());
        return;
    }
    let want: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(GOLDEN).unwrap_or_else(|_| panic!("{GOLDEN} is missing: record it (see the header)"))).unwrap();
    let bad: Vec<(&Value, Option<&Value>)> = got.iter().enumerate().filter(|(i, g)| want.get(*i) != Some(*g)).map(|(i, g)| (g, want.get(i))).collect();
    assert_eq!(got.len(), want.len(), "the pool changed size: re-record (see the header)");
    assert!(bad.is_empty(), "{} of {} LINE decisions differ, first: got {} want {:?}", bad.len(), got.len(), bad[0].0, bad[0].1);
}
