//! The nearest programme names of a not-found question come with the router's decision (plan 019 step 3.5: the page no longer runs its own
//! loose resolver or `nearSpelling`). Run: cargo test -p reflex-wasm --test near_detail
use reflex_wasm::resolve::{Catalogue, Programme};
use reflex_wasm::route::detail::decision;
use reflex_wasm::route::{Config, Ctx, Manual, ProgState, Route};
use serde_json::Value;

fn catalogue() -> Catalogue {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/programmes.json");
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let rows: Vec<Programme> = doc["programmes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["code"].as_str().is_some_and(|c| !c.is_empty()) && p["title"].as_str().is_some_and(|t| !t.trim().is_empty()))
        .map(|p| serde_json::from_value(p.clone()).unwrap())
        .collect();
    Catalogue::new(&rows)
}

fn titles(cat: &Catalogue, route: Route, q: &str) -> Option<Vec<String>> {
    let manual = Manual::new(Vec::new());
    let ctx = Ctx { pinned: false, prog_state: ProgState::Ok, ai_off: true, pinned_entry: None, programme_in_focus: None, today: "2026-11-14".into(), catalogue: Some(cat), manual: &manual, config: Config::default() };
    decision(Some(route), q, &ctx).programme.map(|r| cat.titles(&r).map(String::from).collect())
}

#[test]
fn a_misspelt_programme_name_offers_the_nearest_names() {
    let cat = catalogue();
    let got = titles(&cat, Route::UnsureProgramme, "อยากเรียนกายอุปกณ์").expect("the nearest names");
    assert!(got.iter().any(|t| t.contains("กายอุปกรณ์")), "{got:?}");
}

#[test]
fn a_shared_fragment_offers_no_names() {
    let cat = catalogue();
    assert_eq!(titles(&cat, Route::UnsureProgramme, "โรงอาหาร"), None);
}

#[test]
fn other_routes_carry_no_near_names() {
    let cat = catalogue();
    assert_eq!(titles(&cat, Route::TopicPicks, "อยากเรียนกายอุปกณ์"), None);
}
