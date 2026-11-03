//! The page's regexes, compiled for Rust. They are used verbatim (the `patterns_src.rs` files are generated from chatbot.html);
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

/// JS regex source -> this engine's syntax (see the module doc). Panics on a construct the port does not cover, so a change in
/// chatbot.html that needs new handling fails loudly in the golden tests instead of matching differently.
pub fn translate(src: &str) -> String {
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
                (Some(e @ ('S' | 'b')), true) => panic!("\\{e} inside a character class is not ported: {src}"),
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
    out
}

pub fn compile_src(src: &str, flags: &str) -> Regex {
    RegexBuilder::new(&translate(src)).case_insensitive(flags.contains('i')).build().expect("page regex compiles")
}

pub fn compile(re: &Re) -> Regex {
    compile_src(re.src, re.flags)
}
