//! Hand-written cases for the readers behind the routes' views (plan 015 step 4c moved them here from the page's node tests when the JS copies
//! went: personal_boundary, stuck_intent, date_awareness, chat_robust, programme_resolve). The recorded contract (route_text.json) checks the
//! same functions over 2,284 texts; these are the cases each QA item was written for.
//! Run: cargo test -p reflex-wasm --test route_predicates
use reflex_wasm::route::aspect::follow_up_aspect;
use reflex_wasm::route::dates::{time_intent, TimeIntent};
use reflex_wasm::route::programme::is_finder_question;
use reflex_wasm::route::stuck::{cat_key, stuck_picks, stuck_topic};
use reflex_wasm::route::study_intent::has_study_intent;
use reflex_wasm::route::vocab::vocab;
use reflex_wasm::route::{personal_ask, Manual, ManualEntry, Personal};

fn failures<T: std::fmt::Debug + PartialEq>(cases: &[(&str, T)], f: impl Fn(&str) -> T) -> Vec<String> {
    cases.iter().filter_map(|(q, want)| {
        let got = f(q);
        (got != *want).then(|| format!("{q:?}: got {got:?}, want {want:?}"))
    }).collect()
}

fn all<T: Clone>(qs: &[&'static str], want: T) -> Vec<(&'static str, T)> {
    qs.iter().map(|q| (*q, want.clone())).collect()
}

#[test]
fn personal_record_lookups() {
    let self_qs = ["ผลสอบของฉันออกหรือยัง", "เกรดของผมเท่าไร", "ค่าเทอมที่ผมค้างจ่ายเท่าไร", "สถานะคำร้องบฑ.1 ของฉัน", "อาจารย์ที่ปรึกษาของผมคือใคร", "ผมสอบผ่านหรือยัง", "ผมจบหรือยัง", "ยอดค้างชำระของหนูเท่าไหร่", "ผมได้ทุนไหม"];
    let other = ["ขอดูข้อมูลของเพื่อนผมหน่อย รหัส 6537001", "เพื่อนผมสอบผ่านหรือยัง", "ขอดูผลสอบรหัส 6537001", "เกรดของน้องผมเท่าไร", "สถานะคำร้องของแฟนผม"];
    let general = ["ผมสอบผ่านแล้วต้องทำอะไรต่อ", "ผมจะดูเกรดได้ที่ไหน", "ผมต้องส่งรูปเล่มภายในกี่วัน", "ผมค้างจ่ายค่าเทอมต้องทำอย่างไร", "เกรดต่ำสุดที่ผ่านคือเท่าไร", "ผลสอบออกเมื่อไร", "ผมขอทุนได้ไหม",
        "ขั้นตอนการยื่นคำร้องของผม", "เพื่อนผมต้องส่งรูปเล่มกี่วัน", "ผมอยากสมัครเรียนจิตวิทยาคลินิก", "ค่าเทอมเท่าไร", "ผมเข้าระบบไม่ได้", "Turnitin เกิน 25% ทำอย่างไร", "สถานะการรับสมัครของหลักสูตรนี้", "ถ้าผมสอบไม่ผ่านจะทำอย่างไร"];
    let mut cases = all(&self_qs, Some(Personal::SelfRecord));
    cases.extend(all(&other, Some(Personal::Other)));
    cases.extend(all(&general, None));
    let bad = failures(&cases, personal_ask);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

#[test]
fn stuck_messages() {
    let bare = ["ติดปัญหา", "ติดปัญหาค่ะ", "ติดปัญหาครับ", "ผมติดปัญหาครับ", "มีปัญหา", "มีปัญหาค่ะ", "ช่วยด้วย", "ช่วยด้วยครับ", "ช่วยหน่อย", "ขอความช่วยเหลือ", "ไม่รู้จะทำยังไงดี", "ทำยังไงดี", "งงมาก", "ติด ปัญหา"];
    let area = [("ติดปัญหาวิทยานิพนธ์", "thesis"), ("ติดปัญหาเรื่องวิทยานิพนธ์", "thesis"), ("มีปัญหาเรื่องส่งเล่ม", "thesis"), ("ติดปัญหา Turnitin", "thesis"),
        ("ติดปัญหาเรื่องลงทะเบียน", "reg"), ("ติดปัญหาจ่ายค่าเทอม", "reg"), ("ลงทะเบียนมีปัญหาครับ", "reg"), ("ติดปัญหาการชำระเงิน", "reg"),
        ("ติดปัญหาเรื่องลาพัก", "status"), ("มีปัญหาเรื่องลาออก", "status"), ("ติดปัญหาเรื่องขอจบ", "grad"), ("ติดปัญหาเรื่องเอกสาร", "grad")];
    let leave = ["ติดปัญหาส่งเล่มเกินกำหนดต้องเสียค่าปรับไหม", "ติดปัญหาเข้าระบบไม่ได้", "ระบบลงทะเบียนมีปัญหา", "เข้าระบบไม่ได้ ช่วยด้วย", "ช่วยแนะนำวิธีจัดการเวลาทำวิทยานิพนธ์",
        "ส่งรูปเล่มภายในกี่วัน", "ติดปัญหาเรื่องที่จอดรถ", "ปัญหาพิเศษคืออะไร", "อยากลาพักการศึกษา ควรทำยังไง", "ok", ""];
    // "" = stuck with no area named; None = not a stuck message
    let key = |q: &str| stuck_topic(q).map(|c| c.map_or("", cat_key));
    let mut cases = all(&bare, Some(""));
    cases.extend(area.iter().map(|(q, k)| (*q, Some(*k))));
    cases.extend(all(&leave, None));
    let bad = failures(&cases, key);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

/// The published manual (python3 submissions/build_knowledge_index.py writes it).
fn manual() -> Manual {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../submissions/ui/knowledge-index.json");
    let raw = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("{path} is missing: run python3 submissions/build_knowledge_index.py"));
    let kb: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
    let s = |e: &serde_json::Value, k: &str| e[k].as_str().unwrap_or("").to_string();
    Manual::new(kb.iter().map(|e| ManualEntry { id: s(e, "id"), title: s(e, "title"), keywords: s(e, "keywords"), staff: false, category: s(e, "category"), answer: s(e, "answer"), academic_year: e["academic_year"].as_str().map(String::from), semester: e["semester"].as_str().map(String::from) }).collect())
}

#[test]
fn stuck_chips_come_from_the_manual_and_stay_in_their_area() {
    let cats = &vocab().stuck_cats;
    let thesis = cats.iter().position(|c| c.key == "thesis").expect("thesis area");
    assert!(stuck_picks(&cats[thesis], thesis, &Manual::new(Vec::new())).is_empty(), "an empty manual offers no chips for the area");
    let manual = manual();
    let picks = stuck_picks(&cats[thesis], thesis, &manual);
    let title = |id: &String| manual.entries().iter().find(|e| &e.id == id).map(|e| e.title.clone()).unwrap_or_default();
    let thesis_words = ["วิทยานิพนธ์", "สารนิพนธ์", "รูปเล่ม", "เล่ม", "Turnitin", "Thesis", "หน้าลงนาม", "หน้าอนุมัติ"];
    assert!(!picks.is_empty() && picks.len() <= 6, "thesis chips: {picks:?}");
    let off: Vec<String> = picks.iter().map(title).filter(|t| !thesis_words.iter().any(|w| t.to_lowercase().contains(&w.to_lowercase()))).collect();
    assert!(off.is_empty(), "off-area chips offered: {off:?}");
}

#[test]
fn time_intent_only_when_nothing_but_schedule_words_are_left() {
    use TimeIntent::*;
    let cases = [("ยังทันไหม", Some(Any)), ("วันนี้ปิดรับหรือยัง", Some(Admissions)), ("ตอนนี้ภาคเรียนอะไร", Some(Registration)), ("ตอนนี้อยู่ในช่วงลงทะเบียนไหม", Some(Registration)),
        ("ตัดรอบสมัครรอบ 1 พ.ย. 2569 ผ่านไปแล้วหรือยัง", Some(Admissions)), ("ตอนนี้ลาพักได้ไหม", None), ("ส่งเล่มหรือยัง", None), ("ลงทะเบียนได้ถึงเมื่อไหร่", None), ("จิตวิทยาคลินิกยังทันไหม", None)];
    let bad = failures(&cases, time_intent);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

#[test]
fn study_intent_reads_study_words_and_leaves_out_other_topics() {
    let yes = ["เรียนราย", "เรียนรายยย", "อยากเรียนต่อ", "สนใจสมัครแต่ไม่รู้สาขา", "อยากเรียนโท", "มีหลักสูตรอะไร", "ปริญญาเอกมีไหม", "want to study abroad program"];
    let no = ["ค่าเทอมเท่าไหร่", "ลงทะเบียนเรียนวิชา GRID", "ส่งเล่มวิทยานิพนธ์กี่วัน", "ทุนการศึกษามีอะไรบ้าง", "เปลี่ยนอาจารย์ที่ปรึกษา", "ร้านกาแฟอยู่ไหน", "ลืมรหัสผ่าน", "ลาพักการศึกษาได้ไหม", "สมัครสอบ TOEFL ITP", "ขอวุฒิการศึกษา", ""];
    let mut cases = all(&yes, true);
    cases.extend(all(&no, false));
    let bad = failures(&cases, has_study_intent);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

#[test]
fn follow_up_aspects() {
    let want = [("แล้วค่าเทอมล่ะ", Some("fee")), ("ค่าเทอมเท่าไหร่", Some("fee")), ("มีทุนไหม", Some("scholarship")), ("ใช้เอกสารอะไรบ้าง", Some("docs")), ("ต้องจบอะไรมา", Some("elig")),
        ("คุณสมบัติผู้สมัครมีอะไรบ้าง", Some("elig")), ("ภาษาอังกฤษต้องได้เท่าไหร่", Some("english")), ("สอบวันไหน", Some("schedule")), ("สัมภาษณ์เมื่อไหร่", Some("schedule")), ("ยังเปิดรับอยู่ไหม", Some("status")), ("รับกี่คน", Some("status"))];
    // a question that brings its own scope is not a follow-up: level, code, other topic, university-wide, long, or no aspect at all
    let not = ["ค่าเทอม ป.โท เท่าไหร่", "ค่าเทอม 2022M04G", "ค่าสมัครเท่าไหร่", "ค่าเทอมทุกหลักสูตรเท่าไหร่", "ทุนของมหิดลมีอะไรบ้าง", "ลงทะเบียนภาคปลายวันไหน", "ส่งเล่มวิทยานิพนธ์กี่วัน",
        "ขอบคุณครับ", "โอเค", "อยากถามเรื่องการลาพักการศึกษาระหว่างภาคเรียนว่าต้องยื่นเอกสารที่ไหนและใช้เวลากี่วัน"];
    let mut cases = want.to_vec();
    cases.extend(all(&not, None));
    let bad = failures(&cases, follow_up_aspect);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

#[test]
fn finder_questions() {
    let yes = ["เรียนไรดี", "เรียนอะไรดี", "อยากเรียนต่อโท เรียนอะไรดี", "ป.โท สาขาไหนดี", "มีหลักสูตรอะไรบ้าง", "ไม่รู้จะเรียนอะไร", "แนะนำหลักสูตรหน่อย", "หลักสูตรที่เปิดรับมีอะไรบ้าง", "what should i study"];
    let no = ["มีสาขาเคมีไหม", "จิตวิทยาคลินิกดีไหม", "ลงทะเบียนวิชาอะไรดี", "สมัครเรียนจิตวิทยาคลินิก", "ค่าเทอมเท่าไหร่", "ส่งเล่มวิทยานิพนธ์กี่วัน"];
    let mut cases = all(&yes, true);
    cases.extend(all(&no, false));
    let bad = failures(&cases, is_finder_question);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}
