//! The Rust decision order vs the recorded contract (benchmark/golden/route.json, recorded from the page in a real browser).
//! Run: cargo test -p reflex-wasm --test golden_route
//!
//! `decide_prefix` ports an ORDERED PREFIX of the page's branches, so two things must hold for every recorded single question:
//!   (1) if the page took a ported branch, Rust takes the same one;
//!   (2) if the page took a branch that is not ported (it comes later in the order), Rust must say "continue" - no ported branch may fire.
//! Sessions (follow-up turns carry state) are not checked here yet: the state they need belongs to the later branches.
//! The recording mode picks the catalogue state: `nocat` = failed, anything else = loaded.
use reflex_wasm::route::{decide_prefix, Config, Ctx, Manual, ManualEntry, ProgState, Route};
use serde_json::Value;

/// The branches ported so far. Add one here when it lands in `decide_prefix`.
const PORTED: &[Route] = &[Route::Wellbeing, Route::Smalltalk, Route::Personal, Route::StuckPick, Route::Restart, Route::Overview, Route::CatalogueNotReady, Route::GenericFee];

/// The manual the contract was recorded against: the published index (python3 submissions/build_knowledge_index.py writes it; CI builds it first).
fn manual() -> Manual {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/knowledge-index.json");
    let raw = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("{path} is missing: run python3 submissions/build_knowledge_index.py"));
    let kb: Vec<Value> = serde_json::from_str(&raw).unwrap();
    Manual::new(kb.iter().map(|e| ManualEntry { id: e["id"].as_str().unwrap().into(), title: e["title"].as_str().unwrap().into(), keywords: e["keywords"].as_str().unwrap().into(), staff: false }).collect())
}

#[test]
fn ported_prefix_matches_the_recorded_routes() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/route.json");
    let all: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let manual = manual();
    let (mut checked, mut ported_seen, mut bad) = (0usize, 0usize, Vec::new());
    for r in all.iter().filter(|r| r["kind"] == "single") {
        let (q, want_name) = (r["q"].as_str().unwrap(), r["route"].as_str().unwrap());
        let want = Route::from_name(want_name).unwrap_or_else(|| panic!("unknown route {want_name:?} in the contract"));
        // mode "nocat" = the page was served with programmes.json answering 500 (the catalogue failed to load); every other mode has it loaded
        let prog_state = if r.get("mode").and_then(|m| m.as_str()) == Some("nocat") { ProgState::Failed } else { ProgState::Ok };
        let got = decide_prefix(q, &Ctx { pinned: false, prog_state, programme_in_focus: None, manual: &manual, config: Config::default() });
        checked += 1;
        let ok = match PORTED.contains(&want) {
            true => {
                ported_seen += 1;
                got == Some(want)
            }
            false => got.is_none(),
        };
        if !ok {
            bad.push(format!("{q:?}: page {want_name}, rust {:?}", got.map(|g| g.name())));
        }
    }
    assert!(checked > 1000, "contract looks truncated: {checked} single questions");
    assert!(ported_seen >= 60, "the contract has too few ported-branch examples: {ported_seen}");
    assert!(bad.is_empty(), "{} of {checked} differ:\n{}", bad.len(), bad.iter().take(12).cloned().collect::<Vec<_>>().join("\n"));
    println!("{checked} single questions checked, {ported_seen} of them on a ported branch");
}

#[test]
fn route_names_round_trip() {
    for r in Route::ALL {
        assert_eq!(Route::from_name(r.name()), Some(*r));
    }
}
