//! Plan 019 step 1.4: a named admission round picks the ranked entry (s >= 3) whose title names that round.
//! Synthetic entries shaped like the College of Music pack and the Graduate School schedule. Run: cargo test -p reflex-wasm --test round_pick
use reflex_wasm::route::scope::{scope_clarify, Ranked, Scope};
use reflex_wasm::route::ManualEntry;

fn entry(id: &str, title: &str, category: &str, year: Option<&str>) -> ManualEntry {
    ManualEntry { id: id.into(), title: title.into(), keywords: title.into(), staff: false, category: category.into(), answer: String::new(), academic_year: year.map(String::from), semester: None }
}

fn music() -> Vec<ManualEntry> {
    vec![
        entry("master_majors", "ปริญญาโทมีสาขาอะไรบ้าง", "programmes", None),
        entry("grad_round5", "บัณฑิตศึกษามีรอบ 5 ไหม", "admissions", None),
        entry("round_2", "รับสมัครรอบ 2 ปีการศึกษา 2570 ปิดรับเมื่อไร", "admissions", None),
    ]
}

fn ranked<'a>(kb: &'a [ManualEntry], scores: &[(&str, i32)]) -> Vec<Ranked<'a>> {
    scores.iter().map(|(id, s)| Ranked { entry: kb.iter().find(|e| e.id == *id).unwrap(), s: *s }).collect()
}

#[test]
fn a_named_round_picks_the_entry_that_names_it() {
    let kb = music();
    let r = ranked(&kb, &[("master_majors", 6), ("grad_round5", 3)]);
    // the real scores of the music pack (2026-11-14): 6 vs 3
    assert_eq!(scope_clarify("ปริญญาโทมีรอบ 5 ไหม", &r, &kb), Some(Scope::Pick("grad_round5".into())));
    // "รอบที่ 5" and English "round 5" name the same round
    assert_eq!(scope_clarify("ปริญญาโทมีรอบที่ 5 ไหม", &r, &kb), Some(Scope::Pick("grad_round5".into())));
    assert_eq!(scope_clarify("is there round 5 for master", &r, &kb), Some(Scope::Pick("grad_round5".into())));
}

#[test]
fn a_far_entry_or_another_round_does_not_win() {
    let kb = music();
    // under the answering bar (s < 3): the top answers
    assert_eq!(scope_clarify("ปริญญาโทมีรอบ 5 ไหม", &ranked(&kb, &[("master_majors", 6), ("grad_round5", 2)]), &kb), None);
    // the close entry names a different round
    assert_eq!(scope_clarify("ปริญญาโทมีรอบ 5 ไหม", &ranked(&kb, &[("master_majors", 5), ("round_2", 4)]), &kb), None);
    // no round named
    assert_eq!(scope_clarify("ปริญญาโทมีสาขาอะไร", &ranked(&kb, &[("master_majors", 6), ("grad_round5", 4)]), &kb), None);
    // a top score under the guard's bar
    assert_eq!(scope_clarify("ปริญญาโทมีรอบ 5 ไหม", &ranked(&kb, &[("master_majors", 3), ("grad_round5", 3)]), &kb), None);
}

#[test]
fn the_top_that_names_the_round_stays() {
    let kb = music();
    assert_eq!(scope_clarify("รอบ 5 มีไหม", &ranked(&kb, &[("grad_round5", 5), ("master_majors", 4)]), &kb), None);
}

#[test]
fn a_round_the_dated_schedule_lacks_is_still_no_round() {
    // the Graduate School shape: dated admissions entries; round 3 has no schedule
    let kb = vec![entry("sched_r1", "กำหนดการรับสมัครปีการศึกษา 2570 ภาคต้น รอบ 1", "admissions", Some("2570")), entry("sched_r2", "กำหนดการรับสมัครปีการศึกษา 2570 ภาคต้น รอบ 2", "admissions", Some("2570"))];
    assert_eq!(scope_clarify("รอบ 3 ปิดรับเมื่อไร", &ranked(&kb, &[("sched_r1", 5), ("sched_r2", 4)]), &kb), Some(Scope::NoRound));
    // a round it has, ranked second and close: picked
    assert_eq!(scope_clarify("รอบ 2 ปิดรับเมื่อไร", &ranked(&kb, &[("sched_r1", 5), ("sched_r2", 4)]), &kb), Some(Scope::Pick("sched_r2".into())));
}

#[test]
fn a_top_whose_answer_speaks_about_the_round_stays() {
    // "เทคโนโลยีดนตรีมีรอบ 5 ไหม": the Music Technology entry (6) says it takes no round 5; the graduate round-5 entry (3) is not about it
    let mut kb = music();
    kb.push(ManualEntry { answer: "- ไม่รับรอบ 5 (เข้าภาคเรียนที่ 2)".into(), ..entry("bachelor_technology", "เทคโนโลยีดนตรี (ปริญญาตรี)", "programmes", None) });
    let r = ranked(&kb, &[("bachelor_technology", 6), ("grad_round5", 3)]);
    assert_eq!(scope_clarify("เทคโนโลยีดนตรีมีรอบ 5 ไหม", &r, &kb), None);
    // the answer names another round ("รอบ 2"), or "รอบ 52" (not round 5): the round-5 entry still wins
    for other in ["รับสมัครรอบ 2 เท่านั้น", "รอบ 52"] {
        kb.last_mut().unwrap().answer = other.into();
        assert_eq!(scope_clarify("เทคโนโลยีดนตรีมีรอบ 5 ไหม", &ranked(&kb, &[("bachelor_technology", 6), ("grad_round5", 3)]), &kb), Some(Scope::Pick("grad_round5".into())));
    }
}
