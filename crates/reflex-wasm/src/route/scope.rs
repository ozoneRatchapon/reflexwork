//! The scope guard (chatbot.html `<scope-clarify>`): several entries of the manual answer the SAME question for different academic years / semesters; when the
//! user did not say which, ask instead of guessing a year. Ports of `scopeYears`, `scopeOf`, `scopeClarify`.
use super::branches::is_english;
use super::manual::ManualEntry;
use super::vocab::vocab;
use crate::re::compile_src;
use crate::resolve::patterns::patterns;
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

/// The pack's "รอบ N" and "round N" patterns, compiled once.
fn round_res() -> (&'static Regex, &'static Regex) {
    static TH: OnceLock<Regex> = OnceLock::new();
    static EN: OnceLock<Regex> = OnceLock::new();
    let v = vocab();
    (TH.get_or_init(|| compile_src(v.round_th.src, v.round_th.flags)), EN.get_or_init(|| compile_src(v.round_en.src, v.round_en.flags)))
}

/// Every round `text` names, with where it starts ("รอบ 12" is not round 1: the Thai pattern captures the next digit).
fn rounds_in(text: &str) -> impl Iterator<Item = (usize, String)> + '_ {
    let (th, en) = round_res();
    let th_hits = th.captures_iter(text).filter(|c| c[2].is_empty()).map(|c| (c.get(0).unwrap().start(), c[1].to_string()));
    th_hits.chain(en.captures_iter(text).map(|c| (c.get(0).unwrap().start(), c[1].to_string())))
}

fn round_named(q: &str) -> Option<String> {
    // `String.match` finds the LEFTMOST match of "รอบ… (?!\d)" | "round…"
    let hit = rounds_in(q).min_by_key(|h| h.0);
    hit.map(|h| h.1).or_else(|| q.contains(&vocab().words.round_first).then(|| "1".to_string()))
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

/// A ranked entry close enough to the top to answer instead of it when it matches what the user named (a year, a term, a round).
fn close_to_top(r: &Ranked, top: &Ranked) -> bool {
    r.s >= 3.max(top.s - 2)
}

/// The lowest search score that answers at all (`decide_tier`'s last act bar).
const ANSWERS: i32 = 3;

/// The user named admission round `rnd`: a named round the manual has no schedule for, or the ranked entry whose title names that
/// round when the top hit's title does not (plan 019 step 1.4: "ปริญญาโทมีรอบ 5 ไหม" ranked the master-majors list 6 over the round-5
/// entry 3, because the question shares "ปริญญาโทมี" with the majors title). A round number in a title is a selector, like a year the
/// user names, so any entry that answers at all (s >= 3) wins; widening the round entry's keywords instead took the master list away
/// from "ปริญญาโทดนตรีบำบัดมีไหม". A top hit whose title names no round but whose answer speaks about the named one stays
/// ("เทคโนโลยีดนตรีมีรอบ 5 ไหม": the Music Technology entry says "ไม่รับรอบ 5"; the round-5 entry is about graduate study).
fn round_scope(rnd: &str, ranked: &[Ranked], kb: &[ManualEntry]) -> Option<Scope> {
    let top = ranked.first()?;
    let cat = vocab().words.admissions_category.as_str();
    if top.entry.category == cat && !year_of(top.entry).is_empty() {
        let mut rounds: Vec<String> = kb.iter().filter(|e| e.category == cat && !year_of(e).is_empty()).filter_map(|e| round_in_title(&e.title)).collect();
        rounds.sort();
        rounds.dedup();
        if !rounds.is_empty() && !rounds.iter().any(|r| r == rnd) {
            return Some(Scope::NoRound);
        }
    }
    let names = |r: &&Ranked| round_in_title(&r.entry.title).as_deref() == Some(rnd);
    let top_answers_it = || round_in_title(&top.entry.title).is_none() && rounds_in(&top.entry.answer).any(|(_, r)| r == rnd);
    match names(&top) || top_answers_it() {
        true => None,
        false => ranked.iter().skip(1).filter(|r| r.s >= ANSWERS).find(names).map(|r| Scope::Pick(r.entry.id.clone())),
    }
}

/// The user named a degree level (`resolve.levels`: doctoral, master, ...) and the top hit says nothing about it, in its title, its
/// keyword line or its answer: answer the best-ranked entry of the same category whose title names that level instead (plan 019 5.2: "how much is the
/// PhD" ranked the bachelor fees 5 over the doctoral fees 1, because "how much is the" shares letter triples with the bachelor
/// keyword line and "PhD" is too short to weigh; widening the doctoral keywords took "PhD tuition" away). A level in a title is a
/// selector like a round in a title, so any ranked entry may win; the same category keeps a fee question on a fee entry. An
/// English question takes an English-titled candidate first (the Thai and English doctoral fee entries hold the same figures).
/// It runs from the lowest answering score (`ANSWERS`), below the year / round guards' bar of 4: "how much is the master" tops at 3.
fn level_scope(q: &str, ranked: &[Ranked]) -> Option<Scope> {
    let top = ranked.first()?;
    let named: Vec<&Regex> = patterns().levels.iter().map(|(_, re)| re).filter(|re| re.is_match(q)).collect();
    let says = |text: &str| named.iter().any(|re| re.is_match(text));
    if named.is_empty() || [&top.entry.title, &top.entry.keywords, &top.entry.answer].iter().any(|t| says(t)) {
        return None;
    }
    let fits: Vec<&Ranked> = ranked.iter().skip(1).filter(|r| r.entry.category == top.entry.category && says(&r.entry.title)).collect();
    let same_script = |r: &&&Ranked| is_english(q) == is_english(&r.entry.title);
    fits.iter().find(same_script).or(fits.first()).map(|r| Scope::Pick(r.entry.id.clone()))
}

/// The degree levels a text names (`resolve.levels` keys), in the pack's order.
fn levels_in(text: &str) -> Vec<char> {
    patterns().levels.iter().filter(|(_, re)| re.is_match(text)).map(|(k, _)| *k).collect()
}

/// The top two hits tie, share a category and their titles name different degree levels, and the user named none: the question
/// fits each level, so the reply offers them instead of acting on the first by cosine (plan 019 5.1: English "tuition fee" tied the
/// doctoral and bachelor fees at 4 and got the doctoral ones). A blanket "tie at the top offers" changed 135 of 2221 Graduate
/// School routes, nearly all for the worse (year / term schedules the scope guard handles, near-duplicate answers, unrelated
/// entries), so only a level split counts.
pub fn level_tie(q: &str, ranked: &[Ranked]) -> bool {
    let (Some(a), Some(b)) = (ranked.first(), ranked.get(1)) else { return false };
    a.s == b.s && a.entry.category == b.entry.category && levels_in(q).is_empty() && levels_in(&a.entry.title) != levels_in(&b.entry.title)
}

/// `scopeClarify(q, ranked, kb)`.
pub fn scope_clarify(q: &str, ranked: &[Ranked], kb: &[ManualEntry]) -> Option<Scope> {
    let top = ranked.first()?;
    if top.s < ANSWERS {
        return None;
    }
    if top.s < 4 {
        return level_scope(q, ranked);
    }
    if let Some(sc) = round_named(q).and_then(|rnd| round_scope(&rnd, ranked, kb)) {
        return Some(sc);
    }
    if let Some(sc) = level_scope(q, ranked) {
        return Some(sc);
    }
    if year_of(top.entry).is_empty() {
        return None;
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
            if close_to_top(h0, top) {
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
