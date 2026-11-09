//! `stuckTopic` / `stuckPicks` and the stuck branch of the decision order ("ติดปัญหา", "ช่วยด้วย": stuck, area not said or only an area word).
use super::manual::{Config, Manual};
use super::vocab::{vocab, StuckCatVocab};
use crate::re::{compile, compile_src, is_js_space};
use regex_lite::Regex;
use std::sync::OnceLock;

fn w() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().stuck_w))
}
fn fill() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().stuck_fill))
}
fn after_lead() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src(r"^(?:เรื่อง|กับ|ด้าน|ตอน|เกี่ยวกับ|ที่)", ""))
}
fn left_fill() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src(r"การ|ไม่ได้|ไม่ผ่าน|ของ|เรื่อง|ใน|แล้ว", ""))
}
fn topics() -> &'static Vec<(Regex, Regex)> {
    static R: OnceLock<Vec<(Regex, Regex)>> = OnceLock::new();
    R.get_or_init(|| vocab().stuck_cats.iter().map(|c| (compile(&c.topic), compile(&c.title))).collect())
}

/// `null` = not a stuck message -> `None`; `{cat:null}` = stuck, no area named -> `Some(None)`; `{cat}` = stuck + one area word only -> `Some(Some(index))`.
pub fn stuck_topic(text: &str) -> Option<Option<usize>> {
    let t: String = text.chars().filter(|c| !is_js_space(*c)).collect::<String>().to_lowercase();
    if t.is_empty() || t.encode_utf16().count() > 40 {
        return None;
    }
    let m = w().find(&t)?;
    let before = fill().replace_all(&t[..m.start()], "").into_owned();
    let after = fill().replace_all(after_lead().replace(&t[m.end()..], "").as_ref(), "").into_owned();
    if !before.is_empty() && !after.is_empty() {
        return None;
    }
    if crate::intake::classify_issue(&t).is_some() {
        return None;   // "ระบบลงทะเบียนมีปัญหา", "เข้าระบบไม่ได้ ช่วยด้วย": the account / system intake answers these
    }
    let side = if before.is_empty() { &after } else { &before };
    let rest = fill().replace_all(w().replace(side, "").as_ref(), "").into_owned();
    if rest.is_empty() {
        return Some(None);
    }
    for (i, (topic, _)) in topics().iter().enumerate() {
        let left = topic.replace_all(&rest, "").into_owned();
        if left != rest && left_fill().replace_all(&left, "").is_empty() {
            return Some(Some(i));
        }
    }
    None
}

/// `stuckPicks(c)`: entries of the manual that answer this area - the top hit of a seed phrase, kept when it scores 3+, is not a staff answer and
/// its title belongs to the area. At most 6.
pub fn stuck_picks(cat: &StuckCatVocab, idx: usize, manual: &Manual) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for seed in &cat.seeds {
        if let Some(r) = manual.search(seed).first() {
            if r.hit.s >= 3 && !r.entry.staff && topics()[idx].1.is_match(&r.entry.title) && !out.contains(&r.entry.id) {
                out.push(r.entry.id.clone());
            }
        }
    }
    out.truncate(6);
    out
}

/// The stuck branch: it answers when the message is a stuck message AND there is something to offer (the area's entries, or any area at all).
pub fn stuck_fires(q: &str, manual: &Manual, cfg: &Config) -> bool {
    match stuck_topic(q) {
        None => false,
        Some(Some(i)) => !stuck_picks(&vocab().stuck_cats[i], i, manual).is_empty(),
        Some(None) => vocab().stuck_cats.iter().enumerate().any(|(i, c)| !stuck_picks(c, i, manual).is_empty() || (c.key == "login" && cfg.agency_has_it)),
    }
}

/// The key of an area (`login` | `reg` | `thesis` | `status` | `grad`), for tests and for the view that renders its chips.
pub fn cat_key(i: usize) -> &'static str {
    vocab().stuck_cats[i].key.as_str()
}
