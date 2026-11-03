//! Rust port vs the frozen JS outputs (benchmark/golden/answer_points.json, written by scripts/golden_dump.mjs).
//! Run: cargo test -p reflex-wasm --test golden_answer_points
use reflex_wasm::answer::{answer_points, slot_lead};
use serde_json::Value;

fn golden() -> Vec<Value> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/answer_points.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("golden file")).expect("golden json")
}

#[test]
fn answer_points_match_js_on_every_entry() {
    let cases = golden();
    let bad: Vec<String> = cases
        .iter()
        .filter_map(|c| {
            let want: Vec<String> = serde_json::from_value(c["points"].clone()).unwrap();
            let got = answer_points(c["answer"].as_str().unwrap());
            (got != want).then(|| format!("{}: want {want:?}\n got  {got:?}", c["id"]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cases.len(), bad.iter().take(3).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn slot_lead_matches_js_on_every_entry_and_question() {
    let cases = golden();
    let mut bad = Vec::new();
    for c in &cases {
        for (q, want) in c["slot"].as_object().unwrap() {
            let got = slot_lead(c["answer"].as_str().unwrap(), q);
            if got != want.as_str().unwrap() {
                bad.push(format!("{} / {q}: want {want} got {got:?}", c["id"]));
            }
        }
    }
    assert!(bad.is_empty(), "{} differ:\n{}", bad.len(), bad.iter().take(5).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn edge_cases_follow_js() {
    assert_eq!(answer_points("ประกาศ พ.ศ. 2569 กำหนดให้ส่ง. หากเกินให้แจ้ง"), vec!["ประกาศ พ.ศ. 2569 กำหนดให้ส่ง", "หากเกินให้แจ้ง"]);
    assert_eq!(answer_points("ช่องทาง:\n- โทร 02\n- อีเมล a@b"), vec!["ช่องทาง:", "โทร 02", "อีเมล a@b"]);
    assert_eq!(answer_points("   \n\n"), Vec::<String>::new());
    assert_eq!(slot_lead("ส่งไม่เกิน 21 วัน นับจากวันสอบ", "ส่งกี่วัน"), "ไม่เกิน 21 วัน");
    assert_eq!(slot_lead("ค่าสมัคร 1,000 บาท", "ค่าสมัครเท่าไหร่"), "1,000 บาท");
    assert_eq!(slot_lead("ไม่มีตัวเลข", "กี่วัน"), "");
}
