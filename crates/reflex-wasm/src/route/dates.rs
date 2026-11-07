//! Dates in the manual and the "now / still in time" branch: ports of `dateSpan`, `entrySpan`, `isDatedSchedule`, `timeIntent`, `datedPicks`
//! (chatbot.html `<today>` block). Today is an INPUT (`YYYY-MM-DD`, the Asia/Bangkok day), never read from a clock here.
use super::manual::ManualEntry;
use super::patterns_src::{SNAPSHOT, TIME_REST, TIME_W};
use crate::re::{compile, compile_src};
use regex_lite::Regex;
use std::sync::OnceLock;

const MON_FULL: [&str; 12] = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MON_ABBR: [&str; 12] = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/// `_TH_DATE_RE`: "[d1 –] d2 <month> [25xx]" not inside a longer number.
fn date_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        let alt = MON_FULL.iter().chain(MON_ABBR.iter()).map(|m| m.replace('.', r"\.")).collect::<Vec<_>>().join("|");
        compile_src(&format!(r"(?:^|[^\d])(?:(\d{{1,2}})\s*[–-]\s*)?(\d{{1,2}})\s*({alt})(?:\s*(25\d\d))?"), "")
    })
}

fn month_index(name: &str) -> usize {
    MON_FULL.iter().position(|m| *m == name).or_else(|| MON_ABBR.iter().position(|m| *m == name)).unwrap_or(0)
}

/// Earliest and latest date written in a text, as CE ISO strings. A date without a year takes the next written year; no year at all -> `None`.
pub fn date_span(text: &str) -> Option<(String, String)> {
    struct Hit {
        d: u32,
        m: usize,
        y: i32,
    }
    let mut hits: Vec<Hit> = Vec::new();
    for c in date_re().captures_iter(text) {
        let m = month_index(&c[3]);
        let y = c.get(4).map_or(0, |y| y.as_str().parse().unwrap_or(0));
        if let Some(d1) = c.get(1) {
            hits.push(Hit { d: d1.as_str().parse().unwrap_or(0), m, y });
        }
        hits.push(Hit { d: c[2].parse().unwrap_or(0), m, y });
    }
    let mut y = 0;
    for h in hits.iter_mut().rev() {
        if h.y != 0 {
            y = h.y;
        } else {
            h.y = y;
        }
    }
    let mut isos: Vec<String> = hits.iter().filter(|h| h.y != 0 && (1..=31).contains(&h.d)).map(|h| format!("{}-{:02}-{:02}", h.y - 543, h.m + 1, h.d)).collect();
    isos.sort();
    isos.first().cloned().zip(isos.last().cloned())
}

fn snapshot() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&SNAPSHOT))
}

/// A dated schedule entry of the manual: has an academic year and is a "กำหนดการ" entry.
pub fn is_dated_schedule(e: &ManualEntry) -> bool {
    e.academic_year.as_deref().is_some_and(|y| !y.is_empty()) && e.title.contains("กำหนดการ")
}

/// The span of an entry's answer, leaving out lines about the DATA ("ที่เก็บวันที่ …").
pub fn entry_span(e: &ManualEntry) -> Option<(String, String)> {
    let text = e.answer.split('\n').filter(|l| !snapshot().is_match(l)).collect::<Vec<_>>().join("\n");
    date_span(&text)
}

fn time_w() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&TIME_W))
}
fn time_rest() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&TIME_REST))
}
fn registration_words() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src("ลงทะเบียน|ภาคเรียน|ภาคการศึกษา|เทอม|เรียน", ""))
}
fn admission_words() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src("สมัคร|ตัดรอบ|ปิดรับ|เปิดรับ|หมดเขต|รอบ", ""))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimeIntent {
    Registration,
    Admissions,
    Any,
}

/// `timeIntent`: a "now / still in time" question - after the time words only schedule words, fillers and dates are left.
pub fn time_intent(q: &str) -> Option<TimeIntent> {
    if !time_w().is_match(q) || !time_rest().replace_all(q, "").is_empty() {
        return None;
    }
    Some(if registration_words().is_match(q) {
        TimeIntent::Registration
    } else if admission_words().is_match(q) {
        TimeIntent::Admissions
    } else {
        TimeIntent::Any
    })
}

/// days since 1970-01-01 of a `YYYY-MM-DD` string (Howard Hinnant's civil-from-days inverse); `None` for a malformed date
fn epoch_days(iso: &str) -> Option<i64> {
    let mut it = iso.split('-');
    let (y, m, d): (i64, i64, i64) = (it.next()?.parse().ok()?, it.next()?.parse().ok()?, it.next()?.parse().ok()?);
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PickState {
    Now,
    Ahead,
    Passed,
}

/// `datedPicks(kb, intent, today)`: the dated schedule entries for that intent, nearest to today first (in progress, upcoming, most recently passed); at most 4.
pub fn dated_picks<'a>(kb: &'a [ManualEntry], intent: TimeIntent, today: &str) -> Vec<(&'a ManualEntry, PickState)> {
    let want = match intent {
        TimeIntent::Registration => Some("registration"),
        TimeIntent::Admissions => Some("admissions"),
        TimeIntent::Any => None,
    };
    let mut rows: Vec<(&ManualEntry, (String, String), u8, i64)> = kb
        .iter()
        .filter(|e| is_dated_schedule(e) && want.is_none_or(|w| e.category == w))
        .filter_map(|e| entry_span(e).map(|sp| (e, sp)))
        .map(|(e, sp)| {
            let st: u8 = if sp.1.as_str() < today { 2 } else if sp.0.as_str() <= today { 0 } else { 1 };
            let key = match st {
                2 => -epoch_days(&sp.1).unwrap_or(0),
                1 => epoch_days(&sp.0).unwrap_or(0),
                _ => epoch_days(&sp.1).unwrap_or(0),
            };
            (e, sp, st, key)
        })
        .collect();
    rows.sort_by(|a, b| a.2.cmp(&b.2).then(a.3.cmp(&b.3)));
    rows.into_iter().take(4).map(|(e, _, st, _)| (e, [PickState::Now, PickState::Ahead, PickState::Passed][st as usize])).collect()
}
