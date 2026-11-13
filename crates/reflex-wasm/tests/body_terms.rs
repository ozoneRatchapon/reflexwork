//! Plan 019 Phase 2: a name that sits only in an entry's body list ("มีสาขาแจ๊สไหม") finds the entries that list it.
//! Synthetic entries shaped like the College of Music pack. Run: cargo test -p reflex-wasm --test body_terms
use reflex_wasm::route::body_terms::{entries_naming, list_names};
use reflex_wasm::route::ManualEntry;

fn entry(id: &str, answer: &str) -> ManualEntry {
    ManualEntry { id: id.into(), title: id.into(), keywords: id.into(), staff: false, category: "programmes".into(), answer: answer.into(), academic_year: None, semester: None }
}

fn music() -> Vec<ManualEntry> {
    vec![
        entry("bachelor", "ดุริยางคศาสตรบัณฑิต (Bachelor of Music) มี 9 สาขา: ดนตรีสมัยนิยม (Popular Music), ละครเพลง (Musical Theater), แจ๊ส (Jazz)\nและหลักสูตร MEI"),
        entry("master", "Master of Music: Musical Theatre (Performance and Pedagogy), Thai Music (Performance and Pedagogy), Jazz, Composition"),
        entry("doctoral", "Doctor of Music: Thai Music (Performance Major), Jazz, Conducting, Composition"),
        entry("precollege", "Pre-College มี 6 สาขา: Classical Performance, Thai Music, Popular Music, Jazz, Composition"),
        entry("contact", "โทร: 02 800 2525\nอีเมล: a@b.c"),
    ]
}

fn ids(q: &str, kb: &[ManualEntry]) -> Vec<String> {
    entries_naming(q, kb).into_iter().map(|e| e.id.clone()).collect()
}

#[test]
fn a_list_item_gives_its_thai_and_bracketed_names() {
    let names: Vec<String> = list_names(&music()[0].answer).collect();
    assert_eq!(names, ["ดนตรีสมัยนิยม", "popularmusic", "ละครเพลง", "musicaltheater", "แจ๊ส", "jazz"]);
}

#[test]
fn a_name_only_one_entry_lists_finds_that_entry() {
    let kb = music();
    assert_eq!(ids("มีสาขาแจ๊สไหม", &kb), ["bachelor"]);
    assert_eq!(ids("มีละครเพลงไหม", &kb), ["bachelor"]);
}

#[test]
fn a_shared_name_finds_every_entry_and_the_longest_name_wins() {
    let kb = music();
    assert_eq!(ids("มีสาขา jazz ไหม", &kb), ["bachelor", "master", "doctoral", "precollege"]);
    // "popular music" (12 chars) is in two lists; nothing longer matches
    assert_eq!(ids("มีสาขา Popular Music ไหม", &kb), ["bachelor", "precollege"]);
}

#[test]
fn a_short_line_after_a_colon_is_not_a_list() {
    let kb = music();
    assert!(ids("มีเบอร์ 02 800 2525 ไหม", &kb).is_empty());
    assert!(ids("มีสาขาดนตรีบำบัดไหม", &kb).is_empty());
}

fn decide(q: &str) -> (Option<&'static str>, Option<String>, Option<Vec<String>>) {
    use reflex_wasm::route::router::{decide, StateIn};
    let manual = reflex_wasm::route::Manual::new(music());
    let state = StateIn { prog_state: "none".into(), ai_off: true, pinned_id: None, programme_in_focus: None, today: "2026-11-14".into(), agency_has_it: true };
    let d = decide(q, &state, &manual, None, None).unwrap();
    (d.route, d.entry, d.offered)
}

#[test]
fn the_router_answers_one_entry_offers_a_few_and_needs_an_existence_question() {
    assert_eq!(decide("มีสาขาแจ๊สไหม"), (Some("kb_act"), Some("bachelor".into()), None));
    assert_eq!(decide("มีสาขา Popular Music ไหม"), (Some("disambiguate"), None, Some(vec!["bachelor".into(), "precollege".into()])));
    // four entries list Jazz: more than a disambiguation offers
    assert_eq!(decide("มีสาขา jazz ไหม").0, None);
    // not a question whether it exists
    assert_eq!(decide("แจ๊สสอบอะไร").0, None);
}
