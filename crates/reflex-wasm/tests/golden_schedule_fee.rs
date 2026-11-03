//! Rust port vs the frozen JS outputs (benchmark/golden/schedule_fee.json, 230 programmes).
//! Run: cargo test -p reflex-wasm --test golden_schedule_fee
use reflex_wasm::catalogue::{fee_table, schedule_table};
use serde_json::Value;

fn cases() -> Vec<Value> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../benchmark/golden/schedule_fee.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}
fn lines(v: &Value) -> Vec<String> {
    serde_json::from_value(v.clone()).unwrap()
}

#[test]
fn schedule_matches_js_for_every_programme() {
    let cs = cases();
    let bad: Vec<String> = cs
        .iter()
        .filter_map(|c| {
            let got = serde_json::to_value(schedule_table(&lines(&c["schedule_lines"]))).unwrap();
            (got != c["schedule"]).then(|| format!("{}: want {}\n got {got}", c["code"], c["schedule"]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cs.len(), bad.iter().take(2).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn fee_matches_js_for_every_programme() {
    let cs = cases();
    let bad: Vec<String> = cs
        .iter()
        .filter_map(|c| {
            let got = serde_json::to_value(fee_table(&lines(&c["fee_lines"]))).unwrap();
            (got != c["fee"]).then(|| format!("{}: want {}\n got {got}", c["code"], c["fee"]))
        })
        .collect();
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cs.len(), bad.iter().take(2).cloned().collect::<Vec<_>>().join("\n"));
}

/// Synthetic cases the real catalogue does not contain ("-" amounts, the 4-cell row, odd spacing around "|",
/// a starred note, markup in a list line). Expected values were produced by the JS `_pFee`/`_pSchedule` (2026-11-03).
#[test]
fn edge_cases_follow_js() {
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let fee = serde_json::to_value(fee_table(&s(&[
        "แผนการศึกษา | ระยะเวลา | เหมาจ่าย | ค่าวิจัย | ดูงาน",
        "ค่าวิจัย/อุปกรณ์ | ค่าธรรมเนียมการศึกษาดูงาน",
        "นักศึกษาไทย",
        "แผน ก | 2 ปี | 50,000 | - | ไม่มี",
        "2 ปี|60,000 |-| 1,000",
        "[1] หมายเหตุ ค่าเทอม",
        "นักศึกษาต่างชาติ",
        "แผน ข | 2 ปี | abc | 1 | x",
    ])))
    .unwrap();
    let want_fee: serde_json::Value = serde_json::from_str(r#"{"rows":[{"grp":"นักศึกษาไทย","plan":"แผน ก","dur":"2 ปี","lump":"50,000","res":"-","visit":"ไม่มี"},{"grp":"นักศึกษาไทย","plan":"","dur":"2 ปี","lump":"60,000","res":"-","visit":"1,000"}],"notes":["[1] หมายเหตุ ค่าเทอม"]}"#).unwrap();
    assert_eq!(fee, want_fee);

    let table = schedule_table(&s(&["รอบการรับสมัครของหลักสูตร | รอบ 1", "สอบ | รอบ 1 จ. 1 ม.ค. 2570", "*** หมายเหตุ :", "หมายเหตุ :", "<b>x</b>"]));
    assert_eq!(table.rows, vec![vec!["สอบ".to_string(), "จ. 1 ม.ค. 2570".to_string()]]);
    assert_eq!(table.notes, vec!["หมายเหตุ :", "<b>x</b>"]);

    let list = schedule_table(&s(&["ไม่มีหัวตาราง | x", "<i> & \"q\""]));
    assert_eq!(list.list, vec!["• ไม่มีหัวตาราง: x", "• &lt;i&gt; &amp; &quot;q&quot;"]);
}
