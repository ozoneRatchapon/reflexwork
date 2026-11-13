//! The regexes, compiled for Rust. They come from the pack (`vocab.json`), not from the page;
//! only JS-only syntax is translated: `\s` / `\S` (the ECMAScript whitespace set), `\d` (ASCII digits), `\b` (ASCII word boundary)
//! and `.` (JS `.` excludes all four line terminators, not just `\n`). Case-insensitive matching folds ASCII only.
use regex_lite::{Regex, RegexBuilder};

/// A JavaScript regex literal: source text plus flags.
pub struct Re {
    pub src: &'static str,
    pub flags: &'static str,
}

/// The characters of ECMAScript `\s` (also what `String.prototype.trim` strips), as the inside of a class.
const WS: &str = r"\t-\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}";
const LINE_TERMINATORS: &str = r"\n\r\u{2028}\u{2029}";

pub fn is_js_space(c: char) -> bool {
    matches!(c, '\t'..='\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// JS regex source -> this engine's syntax (see the module doc). A construct the port does not cover is an error, never a different
/// match: `compile_src` panics on it (the golden tests fail loudly), `vocab::check` reports it with the key.
pub fn try_translate(src: &str) -> Result<String, String> {
    let mut out = String::with_capacity(src.len() + 32);
    let (mut it, mut in_class) = (src.chars(), false);
    while let Some(c) = it.next() {
        match (c, in_class) {
            ('\\', _) => match (it.next(), in_class) {
                (Some('s'), false) => out.push_str(&format!("[{WS}]")),
                (Some('s'), true) => out.push_str(WS),
                (Some('S'), false) => out.push_str(&format!("[^{WS}]")),
                (Some('d'), false) => out.push_str("[0-9]"),
                (Some('d'), true) => out.push_str("0-9"),
                (Some('b'), false) => out.push_str(r"\b"),
                (Some(e @ ('S' | 'b')), true) => return Err(format!("\\{e} inside a character class is not ported: {src}")),
                (Some(e), _) => {
                    out.push('\\');
                    out.push(e);
                }
                (None, _) => out.push('\\'),
            },
            ('[', false) => {
                in_class = true;
                out.push(c);
            }
            (']', true) => {
                in_class = false;
                out.push(c);
            }
            ('.', false) => out.push_str(&format!("[^{LINE_TERMINATORS}]")),
            _ => out.push(c),
        }
    }
    Ok(out)
}

pub fn compile_src(src: &str, flags: &str) -> Regex {
    try_compile(src, flags).unwrap_or_else(|e| panic!("page regex compiles: {e}"))
}

/// Compile a JS regex source, or say why it does not compile here.
pub fn try_compile(src: &str, flags: &str) -> Result<Regex, String> {
    RegexBuilder::new(&try_translate(src)?).case_insensitive(flags.contains('i')).build().map_err(|e| e.to_string())
}

pub fn compile(re: &Re) -> Regex {
    compile_src(re.src, re.flags)
}
