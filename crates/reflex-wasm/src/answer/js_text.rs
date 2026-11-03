//! JavaScript string semantics the ports must reproduce exactly: regexes without the `u` flag work on UTF-16 code
//! units, and `\s` / `trim()` use the ECMAScript whitespace + line-terminator set.

pub type U16 = Vec<u16>;

pub fn to_u16(s: &str) -> U16 {
    s.encode_utf16().collect()
}

pub fn from_u16(u: &[u16]) -> String {
    String::from_utf16_lossy(u)
}

/// ECMAScript `\s`: WhiteSpace + LineTerminator (all in the BMP).
pub fn is_js_space(c: u16) -> bool {
    matches!(c, 0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

/// ECMAScript `\d` (ASCII only).
pub fn is_digit(c: u16) -> bool {
    (0x30..=0x39).contains(&c)
}

/// `String.prototype.trim()`.
pub fn trim(u: &[u16]) -> &[u16] {
    let start = u.iter().position(|&c| !is_js_space(c)).unwrap_or(u.len());
    let end = u.iter().rposition(|&c| !is_js_space(c)).map_or(start, |i| i + 1);
    &u[start..end]
}

/// `u` starts with `word` at `at`.
pub fn starts_at(u: &[u16], at: usize, word: &[u16]) -> bool {
    u.len() >= at + word.len() && u[at..at + word.len()] == *word
}

/// End of the run of JS whitespace starting at `at`.
pub fn skip_space(u: &[u16], mut at: usize) -> usize {
    while at < u.len() && is_js_space(u[at]) {
        at += 1;
    }
    at
}
