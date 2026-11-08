//! Text preparation before any branch reads the question: the Rust port of `normChat`, `stripLeadIn` and the Thai-digit part of
//! `normTermYear` (chatbot.html). Known, documented deviations from the page (none is reachable by the 1,477 recorded questions):
//! - JS `String.prototype.normalize('NFC')` is applied for THAI only: its canonical reordering of combining marks (a tone mark typed before
//!   the vowel below it, found by the differential test on a recorded question) is `canonical_order_thai`. Composition of other scripts
//!   (Latin `e` + U+0301 -> `é`) is not done: no NFC table is worth the wasm bytes, and Thai has no composition pairs.
//! - `\p{Cf}` and `\p{Extended_Pictographic}` use tables generated from Node's Unicode data (scripts/gen_route_unicode_tables.mjs); a newer Unicode version in the browser can differ for characters added since.
//! - the term/year rewrite of `normTermYear` lives in `term_year.rs`.

use super::unicode_tables::{in_ranges, FORMAT, PICTOGRAPHIC};
use crate::re::{compile_src, is_js_space};
use regex_lite::Regex;
use std::sync::OnceLock;

/// `typed.slice(0, 500)` counts UTF-16 code units.
pub fn slice_utf16(s: &str, max_units: usize) -> String {
    let (mut n, mut out) = (0usize, String::new());
    for c in s.chars() {
        n += c.len_utf16();
        if n > max_units {
            break;
        }
        out.push(c);
    }
    out
}

/// `[\p{Cf}\u034F\u3164\uFE00-\uFE0F]`: format characters and a few invisible fillers (exact Unicode ranges, see unicode_tables.rs).
fn is_format_char(c: char) -> bool {
    in_ranges(&FORMAT, c) || matches!(c as u32, 0x034F | 0x3164 | 0xFE00..=0xFE0F)
}

/// `[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}]`
fn is_pictographic(c: char) -> bool {
    in_ranges(&PICTOGRAPHIC, c) || matches!(c as u32, 0xFE0F | 0x1F3FB..=0x1F3FF)
}

fn is_thai_mark_or_letter(c: char) -> bool {
    ('\u{0E01}'..='\u{0E4E}').contains(&c)
}

/// Canonical combining class of the Thai marks (Unicode data): sara u / uu 103, phinthu 9, the four tone marks 107; everything else 0.
fn thai_ccc(c: char) -> u8 {
    match c {
        '\u{0E38}' | '\u{0E39}' => 103,
        '\u{0E3A}' => 9,
        '\u{0E48}'..='\u{0E4B}' => 107,
        _ => 0,
    }
}

/// The reordering step of NFC: inside a run of marks with a non-zero class, a stable sort by class.
fn canonical_order_thai(s: &str) -> String {
    let mut cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        if thai_ccc(cs[i]) == 0 {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < cs.len() && thai_ccc(cs[j]) != 0 {
            j += 1;
        }
        cs[i..j].sort_by_key(|c| thai_ccc(*c));   // slice::sort_by_key is stable
        i = j;
    }
    cs.into_iter().collect()
}

/// `normChat`: fold sara am and tone-mark order, drop invisible and pictographic characters, fold fullwidth ASCII, collapse runs.
pub fn norm_chat(q: &str) -> String {
    let q = &canonical_order_thai(q);
    // sara am typed as nikhahit (+ tone) + sara aa
    let mut a = String::with_capacity(q.len());
    let cs: Vec<char> = q.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        match (cs[i], cs.get(i + 1).copied(), cs.get(i + 2).copied()) {
            ('\u{0E4D}', Some(t @ '\u{0E48}'..='\u{0E4B}'), Some('\u{0E32}')) => {
                a.push(t);
                a.push('\u{0E33}');
                i += 3;
            }
            ('\u{0E4D}', Some('\u{0E32}'), _) => {
                a.push('\u{0E33}');
                i += 2;
            }
            (c, _, _) => {
                a.push(c);
                i += 1;
            }
        }
    }
    // a tone mark typed before its vowel: tone + vowel -> vowel + tone (sequential, like the page's global replace)
    let cs: Vec<char> = a.chars().collect();
    let mut b = String::with_capacity(a.len());
    let mut i = 0;
    while i < cs.len() {
        match (cs[i], cs.get(i + 1).copied()) {
            (t @ '\u{0E48}'..='\u{0E4B}', Some(v)) if v == '\u{0E31}' || ('\u{0E34}'..='\u{0E37}').contains(&v) || v == '\u{0E47}' => {
                b.push(v);
                b.push(t);
                i += 2;
            }
            (c, _) => {
                b.push(c);
                i += 1;
            }
        }
    }
    // format characters go; fullwidth ASCII folds; U+3000 is a space; pictographs become a space
    let mut c2 = String::with_capacity(b.len());
    for c in b.chars() {
        if is_format_char(c) {
            continue;
        }
        let c = match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            '\u{3000}' => ' ',
            _ => c,
        };
        c2.push(if is_pictographic(c) { ' ' } else { c });
    }
    // a Thai letter or mark repeated 3+ times keeps one
    let mut d = String::with_capacity(c2.len());
    let cs: Vec<char> = c2.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        let mut j = i + 1;
        while j < cs.len() && cs[j] == c {
            j += 1;
        }
        let run = j - i;
        if is_thai_mark_or_letter(c) && run >= 3 {
            d.push(c);
        } else {
            for _ in 0..run {
                d.push(c);
            }
        }
        i = j;
    }
    // whitespace runs -> one space, trim, then drop a trailing run of ?!.~ (and fullwidth ？！) and spaces
    let mut e = String::with_capacity(d.len());
    let mut prev_space = false;
    for c in d.chars() {
        if is_js_space(c) {
            if !prev_space {
                e.push(' ');
            }
            prev_space = true;
        } else {
            e.push(c);
            prev_space = false;
        }
    }
    let e = e.trim_matches(|c: char| is_js_space(c)).to_string();
    let e = e.trim_end_matches(|c: char| is_js_space(c) || matches!(c, '?' | '!' | '.' | '~' | '？' | '！')).to_string();
    e.trim_matches(|c: char| is_js_space(c)).to_string()
}

fn lead_in() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src(super::vocab::vocab().lead_in.src, super::vocab::vocab().lead_in.flags))
}

/// `stripLeadIn`: "สวัสดีค่ะ ลืมรหัสผ่านทำไง" -> "ลืมรหัสผ่านทำไง" when what remains is a real message (longer than 3 characters and not small talk itself).
pub fn strip_lead_in(q: &str, is_smalltalk: impl Fn(&str) -> bool) -> String {
    let rest = lead_in().replace(q, "").trim_matches(|c: char| is_js_space(c)).to_string();
    match rest.encode_utf16().count() > 3 && rest != q && !is_smalltalk(&rest) {
        true => rest,
        false => q.to_string(),
    }
}

/// The Thai-digit conversion `normTermYear` performs on a registration / term question (the rest of that function is not ported yet, see the module doc).
pub fn thai_digits_to_ascii(s: &str) -> String {
    s.chars().map(|c| match c { '๐'..='๙' => char::from_u32('0' as u32 + (c as u32 - '๐' as u32)).unwrap_or(c), _ => c }).collect()
}
