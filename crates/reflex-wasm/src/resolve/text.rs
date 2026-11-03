//! JS string helpers for the resolver. Trigrams, lengths and `includes` work on UTF-16 code units, as the page does.
use regex_lite::Regex;
use std::collections::HashSet;

pub type Tri = HashSet<[u16; 3]>;

/// ECMAScript `\s` (also what `String.prototype.trim` strips).
pub fn is_js_space(c: char) -> bool {
    matches!(c, '\t'..='\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `s.replace(/\s+/g, with)`
pub fn replace_ws(s: &str, with: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_run = false;
    for c in s.chars() {
        match (is_js_space(c), in_run) {
            (true, false) => {
                out.push_str(with);
                in_run = true;
            }
            (true, true) => {}
            (false, _) => {
                out.push(c);
                in_run = false;
            }
        }
    }
    out
}

/// `_pTone`: tone marks, karan and mai-taikhu (U+0E47-0E4C) are typed inconsistently, so they are ignored.
pub fn tone(s: &str) -> String {
    s.chars().filter(|c| !('\u{e47}'..='\u{e4c}').contains(c)).collect()
}

/// `.replace(_P_ZERO, '')`: zero-width space / non-joiner / joiner.
pub fn strip_zero_width(s: &str) -> String {
    s.chars().filter(|c| !matches!(c, '\u{200b}' | '\u{200c}' | '\u{200d}')).collect()
}

/// `s.replace(/\([^)]*\)/g, with)`: a "(" up to the next ")" (which may contain other "(").
pub fn replace_parens(s: &str, with: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find('(') {
        match rest[open..].find(')') {
            Some(close) => {
                out.push_str(&rest[..open]);
                out.push_str(with);
                rest = &rest[open + close + 1..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    out
}

pub fn u16s(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// `_pTri`: character trigrams of the normalised text.
pub fn tri(s: &str) -> Tri {
    let n = u16s(&tone(&replace_ws(&strip_zero_width(&s.to_lowercase()), "")));
    n.windows(3).map(|w| [w[0], w[1], w[2]]).collect()
}

/// JS `h.includes(n)`.
pub fn includes(h: &[u16], n: &[u16]) -> bool {
    n.is_empty() || h.windows(n.len()).any(|w| w == n)
}

/// `_pPieces`: the share of the needle covered by pieces (3 or more characters) that occur in the name.
pub fn pieces(n: &[u16], h: &[u16]) -> f64 {
    let (mut i, mut cov) = (0usize, 0usize);
    while i < n.len() {
        let mut l = 3;
        if i + l <= n.len() && includes(h, &n[i..i + l]) {
            while i + l < n.len() && includes(h, &n[i..i + l + 1]) {
                l += 1;
            }
            cov += l;
            i += l;
        } else {
            i += 1;
        }
    }
    if n.is_empty() {
        0.0
    } else {
        cov as f64 / n.len() as f64
    }
}

/// `_pCore`: the field name of a programme title (without degree words or the "สาขาวิชา" prefix).
pub fn core_of(title: &str, degree_words: &Regex) -> String {
    let t = replace_parens(title, " ");
    let t = match t.find("สาขาวิชา") {
        Some(i) => t[i + "สาขาวิชา".len()..].to_owned(),
        None => degree_words.replace_all(&t, "").into_owned(),
    };
    tone(&replace_ws(&t, "").to_lowercase())
}
