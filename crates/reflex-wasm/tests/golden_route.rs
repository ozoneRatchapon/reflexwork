//! The Rust decision order vs the recorded contract (benchmark/golden/route.json, recorded from the page in a real browser).
//! Run: cargo test -p reflex-wasm --test golden_route
//!
//! `decide_prefix` ports an ORDERED PREFIX of the page's branches, so two things must hold for every recorded single question:
//!   (1) if the page took a ported branch, Rust takes the same one;
//!   (2) if the page took a branch that is not ported (it comes later in the order), Rust must say "continue" - no ported branch may fire.
//! Sessions (follow-up turns carry state) are not checked here yet: the state they need belongs to the later branches.
use reflex_wasm::route::{decide_prefix, Route};
use serde_json::Value;

/// The branches ported so far. Add one here when it lands in `decide_prefix`.
const PORTED: &[Route] = &[Route::Wellbeing, Route::Smalltalk, Route::Personal, Route::Restart, Route::Overview];
/// Not ported yet, although it comes BEFORE some ported branches (its text rarely overlaps with theirs, which the check below would show).
const SKIPPED_EARLIER: &[Route] = &[Route::StuckPick];

#[test]
fn ported_prefix_matches_the_recorded_routes() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/route.json");
    let all: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let (mut checked, mut ported_seen, mut bad) = (0usize, 0usize, Vec::new());
    for r in all.iter().filter(|r| r["kind"] == "single" && r.get("mode").is_none()) {
        let (q, want_name) = (r["q"].as_str().unwrap(), r["route"].as_str().unwrap());
        let want = Route::from_name(want_name).unwrap_or_else(|| panic!("unknown route {want_name:?} in the contract"));
        let got = decide_prefix(q, false);
        checked += 1;
        let ok = match (PORTED.contains(&want), SKIPPED_EARLIER.contains(&want)) {
            (true, _) => {
                ported_seen += 1;
                got == Some(want)
            }
            (false, true) => got.is_none(),   // stuck_pick: Rust continues; the unported branch decides
            (false, false) => got.is_none(),
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
