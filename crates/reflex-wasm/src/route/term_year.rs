//! `normTermYear` (chatbot.html): students write terms and years in shorthand ("เทอม 1/2569", "เทอมแรกปี 69", "ซัมเมอร์", "เทอมสอง"); this rewrites them to the
//! manual's own words BEFORE search and the scope guard, only for registration / schedule talk. The page's patterns use lookaheads, which `regex-lite` lacks; each is
//! done by capturing the character that would follow and leaving the text unchanged when the lookahead would have failed (the match is consumed either way: no
//! alternative could start inside it).
use super::text::thai_digits_to_ascii;
use crate::re::{compile_src, is_js_space};
use regex_lite::{Captures, Regex};
use std::sync::OnceLock;

const TERM_NUM: [&str; 4] = ["", "ภาคต้น", "ภาคปลาย", "ฤดูร้อน"];

fn re(cell: &'static OnceLock<Regex>, src: &str, flags: &str) -> &'static Regex {
    cell.get_or_init(|| compile_src(src, flags))
}

fn guard() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, "ลงทะเบียน|กำหนดการ|เปิดภาค|ปิดภาค|เทอม|ซัมเมอร์|summer|add ?/? ?drop|ถอนรายวิชา", "i")
}

fn year_digits(y: &str) -> String {
    if y.len() == 2 { format!("25{y}") } else { y.to_string() }
}

pub fn norm_term_year(q: &str) -> String {
    if !guard().is_match(q) {
        return q.to_string();
    }
    // the Thai digits become ASCII; "ค่าเทอม" is hidden so "ค่าเทอม 1 ภาค" (a fee) is not read as a term
    let mut s = thai_digits_to_ascii(q).replace("ค่าเทอม", "\u{1}");

    // "เทอม 1/2569", "ภาคเรียนที่ 2/69": term number / year, the year exactly 2 or 4 digits
    static A: OnceLock<Regex> = OnceLock::new();
    s = re(&A, r"(?:เทอม|ภาค(?:เรียน)?(?:ที่)?)\s*([123])\s*/\s*(\d+)", "").replace_all(&s, |c: &Captures| {
        let y = &c[2];
        match y.len() {
            2 | 4 => format!(" {} ปีการศึกษา {} ", TERM_NUM[c[1].parse::<usize>().unwrap_or(0)], year_digits(y)),
            _ => c[0].to_string(),
        }
    }).into_owned();

    // summer: "เทอมร้อน", "ซัมเมอร์", "ภาคซัมเมอร์", "summer", "เทอม 3" (not followed by a digit)
    static B: OnceLock<Regex> = OnceLock::new();
    s = re(&B, r"เทอม\s*(?:ฤดู)?ร้อน|ซัมเมอร์|ภาค\s*ซัมเมอร์|summer|(?:เทอม|ภาค)\s*(?:ที่\s*)?3(\d?)", "i").replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),   // "เทอม 30": the lookahead (?!\d) fails
            false => " ฤดูร้อน ".to_string(),
        }
    }).into_owned();

    // first term: "เทอมแรก", "เทอมต้น", "เทอมหนึ่ง", "ภาค 1" (not followed by a digit or "/")
    static C: OnceLock<Regex> = OnceLock::new();
    s = re(&C, r"เทอม\s*(?:แรก|ต้น|หนึ่ง)|(?:เทอม|ภาค)\s*(?:ที่\s*)?1([\d/]?)", "").replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => " ภาคต้น ".to_string(),
        }
    }).into_owned();

    // second term: "เทอมสอง", "เทอมปลาย", "เทอมหลัง", "ภาค 2" (not followed by a digit or "/")
    static D: OnceLock<Regex> = OnceLock::new();
    s = re(&D, r"เทอม\s*(?:สอง|ปลาย|หลัง)|(?:เทอม|ภาค)\s*(?:ที่\s*)?2([\d/]?)", "").replace_all(&s, |c: &Captures| {
        match c.get(1).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => " ภาคปลาย ".to_string(),
        }
    }).into_owned();

    // "ปี 69" -> "ปีการศึกษา 2569" (a 2-digit year 67-88, not followed by a digit)
    static E: OnceLock<Regex> = OnceLock::new();
    s = re(&E, r"ปี(?:การศึกษา)?\s*(6[7-9]|7\d|8[0-8])(\d?)", "").replace_all(&s, |c: &Captures| {
        match c.get(2).is_some_and(|d| !d.as_str().is_empty()) {
            true => c[0].to_string(),
            false => format!("ปีการศึกษา 25{}", &c[1]),
        }
    }).into_owned();

    let s = s.replace('\u{1}', "ค่าเทอม");
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
