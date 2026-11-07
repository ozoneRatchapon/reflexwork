//! The programme-matching regexes of the page, compiled once (see `crate::re` for how JS syntax is translated).
use super::patterns_src::{ASKS, DEGREE, FUNC, INTENT, LEAD, LEVELS, OTHER, PAREN, QUAL, TAIL, TOPICS};
use crate::re::{compile, compile_src};
use regex_lite::Regex;
use std::sync::OnceLock;

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
    /// `_P_PAREN`: the "(หลักสูตร)" or "()" a pasted title leaves once the qualifier words are gone.
    pub paren: Regex,
    pub other: Regex,
    pub intent: Regex,
    pub func: Regex,
    pub topics: Vec<(&'static str, Regex)>,
    pub asks: Vec<(&'static str, Regex)>,
    /// `(?:มี)?(?:topic|ask)` for each of TOPICS then ASKS: removed from the text before the programme name is read.
    pub strip: Vec<Regex>,
    /// The same without the leading มี, which can end the name itself ("เคมีสอบข้อเขียน"): the second reading tried.
    pub strip_keep_mi: Vec<Regex>,
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
    let strip_with = |mi: &str| TOPICS.iter().chain(ASKS.iter()).map(|(_, r)| compile_src(&format!("{mi}(?:{})", r.src), "i")).collect();
    let (strip, strip_keep_mi) = (strip_with("(?:มี)?"), strip_with(""));
    Patterns {
        lead: compile_lead(),
        tail: compile(&TAIL),
        degree: compile(&DEGREE),
        qual: compile(&QUAL),
        paren: compile(&PAREN),
        other: compile(&OTHER),
        intent: compile(&INTENT),
        func: compile(&FUNC),
        topics,
        asks,
        strip,
        strip_keep_mi,
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
