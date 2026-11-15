//! A pack's own route golden (plan 019 item 6.3, plan 011 "golden per pack"): which branch of the decision order answers each question,
//! and with which entry, decided by the engine itself (`reflex_wasm::route::router::decide`, the code the page and the LINE worker run)
//! over the manual of the pack's own site. Never the Graduate School's golden: each agency has `benchmark/golden/<agency>/route.json`.
//!
//! The question pool comes from the pack: its example questions, `questions.txt`, `expected.json`, every entry title and its first
//! keywords, plus [`PROBES`] (the branches every deployment has: small talk, wellbeing, restart, personal data, off-topic, other scripts).
//! The state is an adopted site's: no catalogue, AI off (no proxy by default), the IT contact only when `agency.json` names one.

use reflex_wasm::route::router::{decide, manual_from, KbIn, StateIn};
use reflex_wasm::route::Manual;
use serde_json::{Map, Value};

/// The branches every deployment has, written without any agency's topics. A pack's own words come from the pack.
pub const PROBES: &[&str] = &[
    "สวัสดี", "สวัสดีครับ", "hello", "ขอบคุณครับ", "thanks", "บาย", "ทำอะไรได้บ้าง", "สบายดีไหม",
    "เครียดมาก", "อยากตาย", "I feel depressed", "ไม่ไหวแล้ว",
    "เริ่มใหม่", "ยกเลิก", "ข้าม", "มีอะไรน่าสนใจบ้าง", "what should i know",
    "ติดปัญหา", "ช่วยด้วย", "เข้าระบบไม่ได้", "ลืมรหัสผ่าน",
    "ผลสอบของฉันออกหรือยัง", "ขอดูข้อมูลของเพื่อนผม รหัส 6537001",
    "ค่าเทอมเท่าไร", "tuition fee", "ทุนการศึกษามีไหม", "มีหลักสูตรอะไรบ้าง", "ปริญญาโท", "เรียนฟรีไหม", "ทำงานอะไรดี", "เรียนอะไรดี",
    "ยังทันไหม", "ตอนนี้เปิดรับสมัครรอบไหน", "รอบ 2 ปีการศึกษา 2570 ปิดรับเมื่อไหร่", "สมัครรอบ 5", "กำหนดการสมัคร", "ลงทะเบียนภาคปลาย 2570",
    "ช่วยแนะนำวิธีเตรียมตัวหน่อย", "เมืองหลวงของฝรั่งเศสคืออะไร", "what is the capital of France", "こんにちは", "你好",
    "ok", "1234", "https://example.com", "😀", "？", "ส่ง Turnitin เกิน 25% ทำยังไง",
];

/// How many of an entry's keywords become questions (the first ones are the owner's main words for it).
const KEYWORDS_PER_ENTRY: usize = 3;

/// The pack's own question sources (any may be absent).
#[derive(Default)]
pub struct Sources<'a> {
    /// the built site's `agency.json`
    pub agency: Option<&'a Value>,
    /// the pack's `questions.txt` (one question per line, `#` comments)
    pub questions: Option<&'a str>,
    /// the pack's `expected.json` (`answer`, `pick`, `none`, `known_wrong`)
    pub expected: Option<&'a Value>,
}

/// The pool, in a fixed order, without repeats: examples, questions.txt, expected.json, entry titles and keywords, then [`PROBES`].
pub fn pool(index: &[Value], src: &Sources) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut add = |q: &str| {
        let q = q.trim();
        if !q.is_empty() && !out.iter().any(|x| x == q) {
            out.push(q.to_string());
        }
    };
    let examples = src.agency.and_then(|a| a["examples"].as_array()).into_iter().flatten();
    examples.filter_map(|e| e["q"].as_str()).for_each(&mut add);
    src.questions.into_iter().flat_map(str::lines).filter(|l| !l.trim_start().starts_with('#')).for_each(&mut add);
    if let Some(exp) = src.expected {
        exp["answer"].as_object().into_iter().chain(exp["pick"].as_object()).chain(exp["known_wrong"].as_object()).flat_map(Map::keys).for_each(|q| add(q));
        exp["none"].as_array().into_iter().flatten().filter_map(Value::as_str).for_each(&mut add);
    }
    for e in index {
        e["title"].as_str().into_iter().for_each(&mut add);
        let keywords = e["keywords"].as_str().unwrap_or("");
        keywords.split(',').take(KEYWORDS_PER_ENTRY).for_each(&mut add);
    }
    PROBES.iter().for_each(|q| add(q));
    out
}

/// The manual of the site's index, as the page builds it (`new Router(KB, null, vocab)`).
pub fn manual(index: &[Value]) -> Result<Manual, String> {
    let rows = index.iter().enumerate().map(|(i, e)| serde_json::from_value::<KbIn>(e.clone()).map_err(|err| format!("entry {i}: {err}")));
    Ok(manual_from(rows.collect::<Result<Vec<_>, _>>()?))
}

/// An adopted site's state on `today`: no catalogue, AI off, the IT contact only when the agency names one (the page: `!!AGENCY.it`).
pub fn state(agency: Option<&Value>, today: &str) -> StateIn {
    let agency_has_it = agency.is_some_and(|a| !a["it"].is_null() && a["it"] != Value::Bool(false));
    StateIn { prog_state: "none".into(), ai_off: true, pinned_id: None, programme_in_focus: None, today: today.into(), agency_has_it }
}

/// One recorded case: the question, then the decision's fields that are set (route `not_found` when no branch answered).
pub fn case(q: &str, state: &StateIn, manual: &Manual) -> Result<Value, String> {
    let d = decide(q, state, manual, None, None)?;
    let Value::Object(fields) = serde_json::to_value(&d).map_err(|e| e.to_string())? else {
        return Err("a decision is not an object".into());
    };
    let mut out = Map::new();
    out.insert("q".into(), Value::String(q.into()));
    out.insert("route".into(), fields.get("route").filter(|r| !r.is_null()).cloned().unwrap_or_else(|| "not_found".into()));
    out.extend(fields.into_iter().filter(|(k, v)| k != "route" && !v.is_null()));
    Ok(Value::Object(out))
}

/// The golden file: the day it was decided on, then one case per line so a diff names the questions that changed.
pub fn render(today: &str, cases: &[Value]) -> String {
    let lines: Vec<String> = cases.iter().map(Value::to_string).collect();
    format!("{{\"today\":{},\"cases\":[\n{}\n]}}\n", Value::String(today.into()), lines.join(",\n"))
}

/// What changed between a golden and a fresh recording, one line per question (empty: identical).
pub fn diff(golden: &[Value], now: &[Value]) -> Vec<String> {
    let q = |c: &Value| c["q"].as_str().unwrap_or("").to_string();
    let mut out = Vec::new();
    for c in now {
        let name = q(c);
        match golden.iter().find(|g| q(g) == name) {
            None => out.push(format!("new question \"{name}\": {c}")),
            Some(g) if g != c => out.push(format!("\"{name}\"\n   golden {g}\n   now    {c}")),
            Some(_) => {}
        }
    }
    let gone = golden.iter().filter(|g| !now.iter().any(|c| q(c) == q(g)));
    out.extend(gone.map(|g| format!("no longer in the pool \"{}\"", q(g))));
    out
}

/// Count of cases per route, most first (for the summary line).
pub fn route_counts(cases: &[Value]) -> Vec<(String, usize)> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for r in cases.iter().filter_map(|c| c["route"].as_str()) {
        match counts.iter_mut().find(|(k, _)| k == r) {
            Some((_, n)) => *n += 1,
            None => counts.push((r.to_string(), 1)),
        }
    }
    counts.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    counts
}
