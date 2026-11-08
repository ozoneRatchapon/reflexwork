//! The scope guard (chatbot.html `<scope-clarify>`): several entries of the manual answer the SAME question for different academic years / semesters; when the
//! user did not say which, ask instead of guessing a year. Ports of `scopeYears`, `scopeOf`, `scopeClarify`.
use super::manual::ManualEntry;
use super::vocab::vocab;
use crate::re::compile_src;
use regex_lite::Regex;
use std::sync::OnceLock;

/// An entry of the ranked list with its search score.
#[derive(Clone, Copy, Debug)]
pub struct Ranked<'a> {
    pub entry: &'a ManualEntry,
    pub s: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Scope {
    /// ask which year / term (`axis`: "year" | "term" | "both"), with these entries as the choices
    Ask { axis: &'static str, candidates: Vec<String> },
    /// the user named a year / term: answer this entry instead of the top hit
    Pick(String),
    /// the manual has no data for the year the user named
    NoYear,
    /// the manual has no schedule for the admission round the user named
    NoRound,
}

fn term_res() -> &'static Vec<(&'static str, Regex)> {
    static R: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    R.get_or_init(|| {
        let v = vocab();
        [(&v.words.term_first, &v.term_first_pat), (&v.words.term_second, &v.term_second_pat), (&v.words.term_summer, &v.term_summer_pat)]
            .into_iter()
            .map(|(k, p)| (k.as_str(), compile_src(p.src, p.flags)))
            .collect()
    })
}

fn to_ascii_digits(s: &str) -> String {
    super::text::thai_digits_to_ascii(s)
}

fn term_of(s: &str) -> &'static str {
    term_res().iter().find(|(_, re)| re.is_match(s)).map_or("", |(k, _)| *k)
}

fn four_digits() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    // JS: (?:^|[^A-Za-z0-9])(\d{4})(?![A-Za-z0-9]); the lookahead is the captured next character (empty = the lookahead holds)
    R.get_or_init(|| compile_src(r"(?:^|[^A-Za-z0-9])(\d{4})([A-Za-z0-9]?)", ""))
}

/// Every academic year a question names, in order ("ภาคต้น 2569 และ 2570" -> both).
pub fn scope_years(q: &str) -> Vec<String> {
    static REG: OnceLock<Regex> = OnceLock::new();
    static MONEY: OnceLock<Regex> = OnceLock::new();
    static AY: OnceLock<Regex> = OnceLock::new();
    let v = vocab();
    let reg = REG.get_or_init(|| compile_src(v.scope_reg.src, v.scope_reg.flags));
    let money = MONEY.get_or_init(|| compile_src(v.scope_money.src, v.scope_money.flags));
    let ay = AY.get_or_init(|| compile_src(v.scope_ay.src, v.scope_ay.flags));
    let s = to_ascii_digits(q);
    let term = term_of(&s);
    let mut out: Vec<String> = Vec::new();
    for c in four_digits().captures_iter(&s) {
        if !c[2].is_empty() {
            continue;   // the year is part of a longer alphanumeric run
        }
        let (m4, whole) = (c.get(1).unwrap(), c.get(0).unwrap());
        let _ = whole;
        let n: i32 = m4.as_str().parse().unwrap_or(0);
        let chars_before: Vec<char> = s[..m4.start()].chars().collect();
        let before: String = chars_before[chars_before.len().saturating_sub(14)..].iter().collect();
        let after: String = s[m4.end()..].chars().take(6).collect();
        if reg.is_match(&before) || money.is_match(&after) {
            continue;
        }
        // a CE year is a calendar year: a summer term sits in the calendar year AFTER its academic year starts
        let y = if (2567..=2588).contains(&n) {
            n
        } else if (2024..=2045).contains(&n) {
            n + 543 - i32::from(term == v.words.term_summer && !ay.is_match(&before))
        } else {
            0
        };
        if y != 0 && !out.contains(&y.to_string()) {
            out.push(y.to_string());
        }
    }
    out
}

/// `scopeOf`: the first year named and the term named ("" = none).
pub fn scope_of(q: &str) -> (String, &'static str) {
    let s = to_ascii_digits(q);
    (scope_years(&s).into_iter().next().unwrap_or_default(), term_of(&s))
}

fn round_named(q: &str) -> Option<String> {
    static TH: OnceLock<Regex> = OnceLock::new();
    static EN: OnceLock<Regex> = OnceLock::new();
    let v = vocab();
    let th = TH.get_or_init(|| compile_src(v.round_th.src, v.round_th.flags));
    let en = EN.get_or_init(|| compile_src(v.round_en.src, v.round_en.flags));
    // `String.match` finds the LEFTMOST match of "รอบ… (?!\d)" | "round…": the Thai lookahead is the captured next digit
    let th_hit = th.captures_iter(q).find(|c| c[2].is_empty()).map(|c| (c.get(0).unwrap().start(), c[1].to_string()));
    let en_hit = en.captures(q).map(|c| (c.get(0).unwrap().start(), c[1].to_string()));
    let hit = match (th_hit, en_hit) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a } else { b }),
        (a, b) => a.or(b),
    };
    hit.map(|h| h.1).or_else(|| q.contains(&v.words.round_first).then(|| "1".to_string()))
}

fn round_in_title(title: &str) -> Option<String> {
    static R: OnceLock<Regex> = OnceLock::new();
    let p = &vocab().round_in_title;
    R.get_or_init(|| compile_src(p.src, p.flags)).captures(title).map(|c| c[1].to_string())
}

fn term_order(t: Option<&str>) -> i32 {
    let w = &vocab().words;
    match t {
        Some(x) if x == w.term_first => 0,
        Some(x) if x == w.term_second => 1,
        Some(x) if x == w.term_summer => 2,
        _ => 9,
    }
}

fn has_semester(e: &ManualEntry) -> bool {
    e.semester.as_deref().is_some_and(|s| !s.is_empty())
}
fn year_of(e: &ManualEntry) -> &str {
    e.academic_year.as_deref().unwrap_or("")
}

/// `scopeClarify(q, ranked, kb)`.
pub fn scope_clarify(q: &str, ranked: &[Ranked], kb: &[ManualEntry]) -> Option<Scope> {
    let top = ranked.first()?;
    if top.s < 4 || year_of(top.entry).is_empty() {
        return None;
    }
    // a named admission round the manual has no schedule for
    if let Some(rnd) = round_named(q) {
        let cat = vocab().words.admissions_category.as_str();
        if top.entry.category == cat {
            let mut rounds: Vec<String> = kb.iter().filter(|e| e.category == cat && !year_of(e).is_empty()).filter_map(|e| round_in_title(&e.title)).collect();
            rounds.sort();
            rounds.dedup();
            if !rounds.is_empty() && !rounds.contains(&rnd) {
                return Some(Scope::NoRound);
            }
        }
    }
    let (sc_year, sc_term) = scope_of(q);
    let shape = has_semester(top.entry);
    let same: Vec<&Ranked> = ranked.iter().filter(|r| !year_of(r.entry).is_empty() && r.entry.category == top.entry.category && has_semester(r.entry) == shape).collect();
    let years = scope_years(q);
    let mut family: Vec<&ManualEntry> = kb
        .iter()
        .filter(|e| !year_of(e).is_empty() && e.category == top.entry.category && has_semester(e) == shape)
        .filter(|e| if years.len() > 1 { years.iter().any(|y| y == year_of(e)) } else { sc_year.is_empty() || year_of(e) == sc_year })
        .filter(|e| sc_term.is_empty() || e.semester.as_deref() == Some(sc_term))
        .collect();
    family.sort_by(|a, b| year_of(a).cmp(year_of(b)).then(term_order(a.semester.as_deref()).cmp(&term_order(b.semester.as_deref()))));
    let ask = |near: &[&Ranked]| -> Option<Scope> {
        let amb_y = sc_year.is_empty() && near.iter().map(|r| year_of(r.entry)).collect::<std::collections::BTreeSet<_>>().len() > 1;
        let amb_t = sc_term.is_empty() && near.iter().map(|r| r.entry.semester.as_deref()).collect::<std::collections::BTreeSet<_>>().len() > 1;
        if !(amb_y || amb_t) {
            return None;
        }
        let axis = if amb_y && amb_t { "both" } else if amb_y { "year" } else { "term" };
        let cands: Vec<String> = if family.len() > 1 { family.iter().map(|e| e.id.clone()).collect() } else { near.iter().map(|r| r.entry.id.clone()).collect() };
        Some(Scope::Ask { axis, candidates: cands.into_iter().take(6).collect() })
    };
    // two years named: never collapse to the first one
    if years.len() > 1 && family.len() > 1 {
        return Some(Scope::Ask { axis: "year", candidates: family.iter().take(6).map(|e| e.id.clone()).collect() });
    }
    if !sc_year.is_empty() || !sc_term.is_empty() {
        let hit: Vec<&Ranked> = same.iter().copied().filter(|r| (sc_year.is_empty() || year_of(r.entry) == sc_year) && (sc_term.is_empty() || r.entry.semester.as_deref() == Some(sc_term))).collect();
        if let Some(h0) = hit.first() {
            if h0.s >= 3.max(top.s - 2) {
                let near: Vec<&Ranked> = hit.iter().copied().filter(|r| r.s >= h0.s - 1).collect();
                if let Some(a) = ask(&near) {
                    return Some(a);
                }
                return (h0.entry.id != top.entry.id).then(|| Scope::Pick(h0.entry.id.clone()));
            }
        }
        let in_cat: Vec<&ManualEntry> = kb.iter().filter(|e| e.category == top.entry.category && !year_of(e).is_empty()).collect();
        if !sc_year.is_empty() && !in_cat.iter().any(|e| year_of(e) == sc_year) {
            return Some(Scope::NoYear);
        }
        return None;
    }
    let near: Vec<&Ranked> = same.iter().copied().filter(|r| r.s >= top.s - 1).collect();
    ask(&near)
}
