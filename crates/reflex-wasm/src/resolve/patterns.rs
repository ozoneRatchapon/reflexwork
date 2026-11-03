//! The page's regexes, compiled once. They are used verbatim (`patterns_src.rs`); only JS-only syntax is translated:
//! `\s` / `\S` (the ECMAScript whitespace set), `\d` (ASCII digits) and `\b` (ASCII word boundary).
use super::patterns_src::{Re, ASKS, DEGREE, FUNC, INTENT, LEAD, LEVELS, OTHER, QUAL, TAIL, TOPICS};
use regex_lite::{Regex, RegexBuilder};
use std::sync::OnceLock;

const WS: &str = r"\t-\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}";

fn translate(src: &str) -> String {
    let mut out = String::with_capacity(src.len() + 32);
    let mut it = src.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match it.next() {
            Some('s') => out.push_str(&format!("[{WS}]")),
            Some('S') => out.push_str(&format!("[^{WS}]")),
            Some('d') => out.push_str("[0-9]"),
            Some('b') => out.push_str(r"\b"),
            Some(n) => {
                out.push('\\');
                out.push(n);
            }
            None => out.push('\\'),
        }
    }
    out
}

fn compile_src(src: &str, flags: &str) -> Regex {
    RegexBuilder::new(&translate(src)).case_insensitive(flags.contains('i')).build().expect("page regex compiles")
}

fn compile(re: &Re) -> Regex {
    compile_src(re.src, re.flags)
}

/// `_P_LEAD` uses three lookaheads, which this regex engine lacks. Each becomes a capture group; the match is then cut where the
/// lookahead would have stopped (la1, la2: the group's start; la3 is whitespace the pattern's own `\s*` would have eaten anyway).
const LOOKAHEADS: [(&str, &str); 3] = [
    ("(?=หลักสูตร|สาขา)", "(?P<la1>หลักสูตร|สาขา)"),
    ("(?=โท|เอก)", "(?P<la2>โท|เอก)"),
    (r"(?=\s)", r"(?P<la3>\s)"),
];

fn compile_lead() -> Regex {
    let src = LOOKAHEADS.iter().fold(LEAD.src.to_owned(), |s, (from, to)| {
        assert_eq!(s.matches(from).count(), 1, "_P_LEAD lookahead {from} changed in chatbot.html: port it again");
        s.replace(from, to)
    });
    compile_src(&src, LEAD.flags)
}

pub struct Patterns {
    pub lead: Regex,
    pub tail: Regex,
    pub degree: Regex,
    pub qual: Regex,
    pub other: Regex,
    pub intent: Regex,
    pub func: Regex,
    pub topics: Vec<(&'static str, Regex)>,
    pub asks: Vec<(&'static str, Regex)>,
    /// `(?:มี)?(?:topic|ask)` for each of TOPICS then ASKS: removed from the text before the programme name is read.
    pub strip: Vec<Regex>,
    pub levels: Vec<(char, Regex)>,
    pub intl: Regex,
    pub special: Regex,
    pub code: Regex,
    pub trailing_mi: Regex,
    pub degree_words: Regex,
    pub aliases: Vec<(&'static str, Regex)>,
}

/// Abbreviations people really type (`_P_ALIAS`): key, expansions.
pub const ALIASES: [(&str, [&str; 2]); 2] = [
    ("mph", ["สาธารณสุขศาสตร", "public health"]),
    ("itm", ["การจัดการเทคโนโลยีสารสนเทศ", "information technology management"]),
];

fn build() -> Patterns {
    let topics: Vec<_> = TOPICS.iter().map(|(k, r)| (*k, compile(r))).collect();
    let asks: Vec<_> = ASKS.iter().map(|(k, r)| (*k, compile(r))).collect();
    let strip = TOPICS.iter().chain(ASKS.iter()).map(|(_, r)| compile_src(&format!("(?:มี)?(?:{})", r.src), "i")).collect();
    Patterns {
        lead: compile_lead(),
        tail: compile(&TAIL),
        degree: compile(&DEGREE),
        qual: compile(&QUAL),
        other: compile(&OTHER),
        intent: compile(&INTENT),
        func: compile(&FUNC),
        topics,
        asks,
        strip,
        levels: LEVELS.iter().map(|(k, r)| (*k, compile(r))).collect(),
        intl: compile_src("นานาชาติ|international", "i"),
        special: compile_src("ภาคพิเศษ|special program", "i"),
        code: compile_src(r"\b(\d{4}[MDNC]\d{2}[GS])\b", ""),
        trailing_mi: compile_src(r"\s+มี$", ""),
        degree_words: compile_src("มหาบัณฑิต|ดุษฎีบัณฑิต|ประกาศนียบัตรบัณฑิตชั้นสูง|ประกาศนียบัตรบัณฑิต", ""),
        aliases: ALIASES.iter().map(|(a, _)| (*a, compile_src(&format!("(?:^|[^a-z]){a}(?:[^a-z]|$)"), "i"))).collect(),
    }
}

pub fn patterns() -> &'static Patterns {
    static P: OnceLock<Patterns> = OnceLock::new();
    P.get_or_init(build)
}
