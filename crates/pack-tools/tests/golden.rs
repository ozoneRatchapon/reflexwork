//! pack-golden (plan 019 item 6.3): the pool comes from the pack, a case is the engine's own decision, and a diff names what changed.
//! Run: cargo test -p pack-tools --test golden
use pack_tools::golden::{case, diff, manual, pool, render, route_counts, state, Sources, PROBES};
use serde_json::{json, Value};

fn index() -> Vec<Value> {
    vec![
        json!({"id": "lib_hours", "title": "เวลาเปิดทำการของห้องสมุด", "keywords": "เวลาเปิด, เปิดกี่โมง, ปิดกี่โมง, opening hours", "category": "general", "answer": "เปิด 08:00-20:00 น. ทุกวัน"}),
        json!({"id": "lib_fine", "title": "ค่าปรับหนังสือเกินกำหนด", "keywords": "ค่าปรับ, ส่งหนังสือช้า", "category": "fee", "answer": "วันละ 5 บาทต่อเล่ม"}),
    ]
}

#[test]
fn the_pool_is_the_pack_first_then_the_shared_probes_without_repeats() {
    let agency = json!({"examples": [{"q": "เปิดกี่โมง"}, {"q": "ค่าปรับเท่าไร"}]});
    let expected = json!({"answer": {"ค่าปรับเท่าไร": "lib_fine", "ห้องสมุดเปิดวันอาทิตย์ไหม": "lib_hours"}, "none": ["มีที่จอดรถไหม"], "known_wrong": {"ยืมได้กี่วัน": "lib_fine"}});
    let src = Sources { agency: Some(&agency), questions: Some("# comment\nเปิดกี่โมง\n  ห้องสมุดอยู่ที่ไหน  \n\n"), expected: Some(&expected) };
    let p = pool(&index(), &src);
    let head: Vec<&str> = p.iter().take(7).map(String::as_str).collect();
    assert_eq!(head, ["เปิดกี่โมง", "ค่าปรับเท่าไร", "ห้องสมุดอยู่ที่ไหน", "ห้องสมุดเปิดวันอาทิตย์ไหม", "ยืมได้กี่วัน", "มีที่จอดรถไหม", "เวลาเปิดทำการของห้องสมุด"]);
    // the first three keywords of an entry, not the fourth
    assert!(p.iter().any(|q| q == "ปิดกี่โมง") && !p.iter().any(|q| q == "opening hours"));
    assert!(p.ends_with(&PROBES.iter().map(std::string::ToString::to_string).collect::<Vec<_>>()));
    let mut seen = std::collections::HashSet::new();
    assert!(p.iter().all(|q| seen.insert(q)), "a question appears twice");
}

#[test]
fn a_case_is_the_decision_with_its_entry_and_not_found_when_nothing_answers() {
    let m = manual(&index()).unwrap();
    let st = state(None, "2026-11-14");
    let hit = case("ค่าปรับหนังสือเกินกำหนด", &st, &m).unwrap();
    assert_eq!((hit["route"].as_str(), hit["entry"].as_str()), (Some("kb_act"), Some("lib_fine")), "{hit}");
    let miss = case("เมืองหลวงของฝรั่งเศสคืออะไร", &st, &m).unwrap();
    assert_eq!(miss, json!({"q": "เมืองหลวงของฝรั่งเศสคืออะไร", "route": "not_found"}));
    assert_eq!(case("สวัสดี", &st, &m).unwrap(), json!({"q": "สวัสดี", "route": "smalltalk", "kind": "greet"}));
}

#[test]
fn the_it_contact_is_on_only_when_the_agency_names_one() {
    assert!(!state(None, "2026-11-14").agency_has_it);
    assert!(!state(Some(&json!({"name": "x"})), "2026-11-14").agency_has_it);
    assert!(state(Some(&json!({"it": {"label": "IT", "url": "https://x"}})), "2026-11-14").agency_has_it);
}

#[test]
fn the_file_has_one_case_per_line_and_reads_back() {
    let cases = vec![json!({"q": "a", "route": "kb_act", "entry": "x"}), json!({"q": "b", "route": "not_found"})];
    let text = render("2026-11-14", &cases);
    assert_eq!(text.lines().count(), 4);
    let back: Value = serde_json::from_str(&text).unwrap();
    assert_eq!((back["today"].as_str(), back["cases"].as_array()), (Some("2026-11-14"), Some(&cases)));
    assert_eq!(route_counts(&cases), [("kb_act".to_string(), 1), ("not_found".to_string(), 1)]);
}

#[test]
fn a_diff_names_changed_new_and_dropped_questions() {
    let golden = vec![json!({"q": "a", "route": "kb_act", "entry": "x"}), json!({"q": "gone", "route": "not_found"})];
    let now = vec![json!({"q": "a", "route": "kb_act", "entry": "y"}), json!({"q": "new", "route": "smalltalk"})];
    let d = diff(&golden, &now);
    assert_eq!(d.len(), 3, "{d:?}");
    assert!(d[0].starts_with("\"a\"") && d[1].starts_with("new question \"new\"") && d[2] == "no longer in the pool \"gone\"", "{d:?}");
    assert!(diff(&golden, &golden).is_empty());
}
