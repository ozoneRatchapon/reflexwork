//! `normTermYear` (chatbot.html): students write terms and years in shorthand ("เทอม 1/2569", "เทอมแรกปี 69", "ซัมเมอร์", "เทอมสอง"); this rewrites them to the
//! manual's own words BEFORE search and the scope guard, only for registration / schedule talk. The page's patterns use lookaheads, which `regex-lite` lacks; each is
//! done by capturing the character that would follow and leaving the text unchanged when the lookahead would have failed (the match is consumed either way: no
//! alternative could start inside it).
//! The patterns and the words written out come from the pack (`route/vocab.rs`, plan 011 step 2).
use super::text::thai_digits_to_ascii;
use super::vocab::vocab;
use crate::re::{compile_src, is_js_space};
use regex_lite::{Captures, Regex};
use std::sync::OnceLock;

fn re(cell: &'static OnceLock<Regex>, src: &str, flags: &str) -> &'static Regex {
    cell.get_or_init(|| compile_src(src, flags))
}

fn guard() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    let p = &vocab().tny_guard;
    re(&R, p.src, p.flags)
}

fn year_digits(y: &str) -> String {
    if y.len() == 2 { format!("25{y}") } else { y.to_string() }
}

/// The term a term number names ("1" -> first, "2" -> second, "3" -> summer); "" for anything else.
fn term_by_number(n: usize) -> &'static str {
    let w = &vocab().words;
    match n {
        1 => &w.term_first,
        2 => &w.term_second,
        3 => &w.term_summer,
        _ => "",
    }
}

pub fn norm_term_year(q: &str) -> String {
    if !guard().is_match(q) {
        return q.to_string();
    }
    let v = vocab();
    let w = &v.words;
    // the Thai digits become ASCII; the fee word is hidden so "ค่าเทอม 1 ภาค" (a fee) is not read as a term
    let mut s = thai_digits_to_ascii(q).replace(&w.fee_term, "\u{1}");

    // "เทอม 1/2569", "ภาคเรียนที่ 2/69": term number / year, the year exactly 2 or 4 digits
    static A: OnceLock<Regex> = OnceLock::new();
    s = re(&A, v.tny_term_year.src, v.tny_term_year.flags).replace_all(&s, |c: &Captures| {
        let y = &c[2];
        match y.len() {
            2 | 4 => format!(" {} {} {} ", term_by_number(c[1].parse::<usize>().unwrap_or(0)), w.academic_year, year_digits(y)),
            _ => c[0].to_string(),
        }
    }).into_owned();

    // summer: "เทอมร้อน", "ซัมเมอร์", "ภาคซัมเมอร์", "summer", "เทอม 3" (not followed by a digit)
    static B: OnceLock<Regex> = OnceLock::new();
    s = re(&B, v.tny_summer.src, v.tny_summer.flags).replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),   // "เทอม 30": the lookahead (?!\d) fails
            false => format!(" {} ", w.term_summer),
        }
    }).into_owned();

    // first term: "เทอมแรก", "เทอมต้น", "เทอมหนึ่ง", "ภาค 1" (not followed by a digit or "/")
    static C: OnceLock<Regex> = OnceLock::new();
    s = re(&C, v.tny_first.src, v.tny_first.flags).replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => format!(" {} ", w.term_first),
        }
    }).into_owned();

    // second term: "เทอมสอง", "เทอมปลาย", "เทอมหลัง", "ภาค 2" (not followed by a digit or "/")
    static D: OnceLock<Regex> = OnceLock::new();
    s = re(&D, v.tny_second.src, v.tny_second.flags).replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => format!(" {} ", w.term_second),
        }
    }).into_owned();

    // "ปี 69" -> "ปีการศึกษา 2569" (a 2-digit year 67-88, not followed by a digit)
    static E: OnceLock<Regex> = OnceLock::new();
    s = re(&E, v.tny_year.src, v.tny_year.flags).replace_all(&s, |c: &Captures| {
        match c.get(2).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => format!("{} 25{}", w.academic_year, &c[1]),
        }
    }).into_owned();

    let s = s.replace('\u{1}', &w.fee_term);
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for ch in s.chars() {
        if is_js_space(ch) {
            if !prev_space {
                out.push(' ');
            }
            prev_space = true;
        } else {
            out.push(ch);
            prev_space = false;
        }
    }
    out.trim_matches(|c: char| is_js_space(c)).to_string()
}
