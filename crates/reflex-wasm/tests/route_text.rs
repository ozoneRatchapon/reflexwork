//! The text part of the Rust decision order vs the page's own functions (benchmark/golden/route_text.json, scripts/dump_route_text_golden.mjs):
//! normChat, wellbeingKind, personalAsk, isRestartPhrase, isOverviewQuestion over every recorded question plus edge strings.
//! Run: cargo test -p reflex-wasm --test route_text
use reflex_wasm::route::branches::{is_overview_question, is_restart_phrase, personal_ask, wellbeing_kind};
use reflex_wasm::route::text::norm_chat;
use reflex_wasm::route::aspect::{follow_up_aspect, is_generic_fee_question};
use reflex_wasm::route::programme::{english_programme_ask, is_finder_question, is_level_only_question};
use reflex_wasm::route::study_intent::has_study_intent;
use reflex_wasm::route::stuck::stuck_topic;
use reflex_wasm::route::Personal;
use serde_json::Value;

/// Known, documented difference: the page applies Unicode NFC (`String.prototype.normalize`), the Rust port does not (see route/text.rs).
const NFC_ONLY: &[&str] = &["e\u{301}", "A\u{30A}"];

#[test]
fn text_functions_match_the_page() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/route_text.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut bad = Vec::new();
    let mut nfc_seen = 0;
    for c in &cases {
        let t = c["text"].as_str().unwrap();
        let want_norm = c["norm"].as_str().unwrap();
        let got_norm = norm_chat(t);
        if got_norm != want_norm {
            match NFC_ONLY.contains(&t) {
                true => nfc_seen += 1,
                false => bad.push(format!("norm {t:?}: page {want_norm:?} rust {got_norm:?}")),
            }
        }
        // the dump ran the predicates on the RAW text (the page runs them on the normalised text; both are covered by comparing the same input on both sides)
        let json_of = |p: Option<Personal>| p.map(|p| Value::from(match p { Personal::Other => "other", Personal::SelfRecord => "self" })).unwrap_or(Value::Null);
        // stuckTopic: null -> not stuck, "" -> stuck with no area named, otherwise the area key
        let stuck_key = |r: Option<Option<usize>>| match r { None => Value::Null, Some(None) => Value::from(""), Some(Some(i)) => Value::from(reflex_wasm::route::stuck::cat_key(i)) };
        let raw: [(&str, Value, Value); 11] = [
            ("finder", c["finder"].clone(), is_finder_question(t).into()),
            ("levelOnly", c["levelOnly"].clone(), is_level_only_question(t).into()),
            ("enAsk", c["enAsk"].clone(), english_programme_ask(t).map(|(n, k)| serde_json::json!([n, k])).unwrap_or(Value::Null)),
            ("aspect", c["aspect"].clone(), follow_up_aspect(t).map(Value::from).unwrap_or(Value::Null)),
            ("genericFee", c["genericFee"].clone(), is_generic_fee_question(t).into()),
            ("study", c["study"].clone(), has_study_intent(t).into()),
            ("stuck", c["stuck"].clone(), stuck_key(stuck_topic(t))),
            ("wellbeing", c["wellbeing"].clone(), wellbeing_kind(t).map(Value::from).unwrap_or(Value::Null)),
            ("personal", c["personal"].clone(), json_of(personal_ask(t))),
            ("restart", c["restart"].clone(), is_restart_phrase(t).into()),
            ("overview", c["overview"].clone(), is_overview_question(t).into()),
        ];
        for (name, want, got) in raw {
            if want != got {
                bad.push(format!("{name} {t:?}: page {want} rust {got}"));
            }
        }
    }
    assert!(cases.len() > 1500, "contract looks truncated: {}", cases.len());
    assert_eq!(nfc_seen, NFC_ONLY.len(), "the NFC-only edge strings no longer differ: remove the note in route/text.rs and this list");
    assert!(bad.is_empty(), "{} differ over {} texts:\n{}", bad.len(), cases.len(), bad.iter().take(15).cloned().collect::<Vec<_>>().join("\n"));
}
