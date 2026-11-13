//! Plan 019 step 5.2: a degree level the user names picks the same-category entry whose title names it, when the top hit says
//! nothing about that level. Synthetic entries shaped like the College of Music fee entries. Run: cargo test -p reflex-wasm --test level_pick
use reflex_wasm::route::scope::{level_tie, scope_clarify, Ranked, Scope};
use reflex_wasm::route::ManualEntry;

fn entry(id: &str, title: &str, keywords: &str, category: &str, answer: &str) -> ManualEntry {
    ManualEntry { id: id.into(), title: title.into(), keywords: keywords.into(), staff: false, category: category.into(), answer: answer.into(), academic_year: None, semester: None }
}

fn music() -> Vec<ManualEntry> {
    vec![
        entry("bachelor_fees_en", "Bachelor tuition fees by major (per year and 4-year total)", "undergraduate tuition fees cost how much per year", "fee", "Year 1: 100,000 baht"),
        entry("doctoral_fees_th", "ค่าเทอมปริญญาเอก Doctor of Music และ Ph.D.", "doctoral tuition fee PhD", "fee", "Doctor of Music 300,000 บาท"),
        entry("doctoral_fees_en", "Doctoral tuition fees: Doctor of Music and Ph.D.", "doctorate PhD tuition", "fee", "Doctor of Music 300,000 baht"),
        entry("master_fees_en", "Master's degree tuition fees (Thai and international students)", "masters tuition", "fee", "Master of Music 200,000 baht"),
        entry("bachelor_fees_th", "ค่าเทอมปริญญาตรีแต่ละสาขา", "bachelor tuition fee", "fee", "ปี 1 100,000 บาท"),
        entry("doctoral_majors", "ปริญญาเอกมีสาขาอะไรบ้าง", "doctoral majors", "programmes", "Ph.D. in Music"),
        entry("grad_round5", "บัณฑิตศึกษามีรอบ 5 ไหม", "graduate master doctoral 5th round", "admissions", "เปิดรับรอบ 5"),
        entry("grad_english", "เรียนต่อ ป.โท ป.เอก ต้องใช้คะแนนภาษาอังกฤษเท่าไร", "english score", "admissions", "ปริญญาเอก IELTS 6.5"),
    ]
}

fn ranked<'a>(kb: &'a [ManualEntry], scores: &[(&str, i32)]) -> Vec<Ranked<'a>> {
    scores.iter().map(|(id, s)| Ranked { entry: kb.iter().find(|e| e.id == *id).unwrap(), s: *s }).collect()
}

#[test]
fn a_named_level_picks_the_fee_entry_that_names_it() {
    let kb = music();
    // the real order of the music pack (2026-11-14): bachelor 5, then the Thai and English doctoral fees at 1
    let r = ranked(&kb, &[("bachelor_fees_en", 5), ("doctoral_majors", 1), ("doctoral_fees_th", 1), ("doctoral_fees_en", 1)]);
    // an English question takes the English entry; the majors list is another category
    assert_eq!(scope_clarify("how much is the PhD", &r, &kb), Some(Scope::Pick("doctoral_fees_en".into())));
    // a Thai question takes the Thai one
    assert_eq!(scope_clarify("ปริญญาเอกค่าเทอมเท่าไร", &r, &kb), Some(Scope::Pick("doctoral_fees_th".into())));
}

#[test]
fn a_top_that_speaks_about_the_level_stays() {
    let kb = music();
    // the keyword line names the levels ("graduate" study covers both): the top stays
    let r = ranked(&kb, &[("grad_round5", 6), ("grad_english", 1)]);
    assert_eq!(scope_clarify("บัณฑิตศึกษามีรอบ 5 ไหม graduate master doctoral 5th round", &r, &kb), None);
    // the title names it
    assert_eq!(scope_clarify("PhD tuition", &ranked(&kb, &[("doctoral_fees_en", 5), ("doctoral_fees_th", 4)]), &kb), None);
}

#[test]
fn no_level_or_no_candidate_changes_nothing() {
    let kb = music();
    let r = ranked(&kb, &[("bachelor_fees_en", 5), ("doctoral_fees_en", 1)]);
    assert_eq!(scope_clarify("how much is the tuition", &r, &kb), None, "no level named");
    // only another category names the level: the top answers
    assert_eq!(scope_clarify("how much is the PhD", &ranked(&kb, &[("bachelor_fees_en", 5), ("doctoral_majors", 1)]), &kb), None);
}

#[test]
fn a_top_at_the_lowest_answering_score_is_steered_too() {
    let kb = music();
    // the real scores (2026-11-14): the bachelor fees answer at 3, under the year / round guards' bar of 4
    let r = ranked(&kb, &[("bachelor_fees_en", 3), ("grad_round5", 1), ("master_fees_en", 1)]);
    assert_eq!(scope_clarify("how much is the master", &r, &kb), Some(Scope::Pick("master_fees_en".into())));
    // under the answering bar nothing is picked
    assert_eq!(scope_clarify("how much is the master", &ranked(&kb, &[("bachelor_fees_en", 2), ("master_fees_en", 1)]), &kb), None);
}

#[test]
fn a_tie_between_two_levels_offers_both() {
    let kb = music();
    // English "tuition fee" (2026-11-14): the Thai doctoral and bachelor fees tie at 4
    let r = ranked(&kb, &[("doctoral_fees_th", 4), ("bachelor_fees_th", 4)]);
    assert!(level_tie("tuition fee", &r));
    // the user named a level: level_scope / the top answers, no offer
    assert!(!level_tie("PhD tuition fee", &r));
    // not a tie, or both titles name the same level, or another category
    assert!(!level_tie("tuition fee", &ranked(&kb, &[("doctoral_fees_th", 5), ("bachelor_fees_th", 4)])));
    assert!(!level_tie("tuition fee", &ranked(&kb, &[("doctoral_fees_th", 4), ("doctoral_fees_en", 4)])));
    assert!(!level_tie("tuition fee", &ranked(&kb, &[("doctoral_fees_th", 4), ("doctoral_majors", 4)])));
    // two titles naming no level (like the Graduate School's year / term schedules): the tie rule stays as it was
    assert!(!level_tie("how much per year", &ranked(&kb, &[("bachelor_fees_en", 4), ("bachelor_fees_th", 4)])));
}
