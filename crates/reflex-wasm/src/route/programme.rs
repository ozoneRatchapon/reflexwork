//! The programme path of the decision order: which question goes to the programme resolver (a card or a picker), and which goes to the finder.
//! Ports of `isFinderQuestion`, `isLevelOnlyQuestion`, `englishProgrammeAsk` (chatbot.html) and the branch that calls `resolveProgramme`.
use super::vocab::vocab;
use crate::re::{compile, compile_src, is_js_space};
use crate::resolve::patterns::patterns;
use crate::resolve::{Catalogue, Kind};
use regex_lite::Regex;
use std::sync::OnceLock;

macro_rules! lazy_re {
    ($fname:ident, $pat:expr) => {
        fn $fname() -> &'static Regex {
            static R: OnceLock<Regex> = OnceLock::new();
            R.get_or_init(|| compile(&$pat))
        }
    };
}
lazy_re!(findq, vocab().findq);
lazy_re!(career, vocab().career);
lazy_re!(level_fill, vocab().level_fill);
lazy_re!(en_fill, vocab().en_fill);
lazy_re!(en_schedule, vocab().en_ask_schedule);
lazy_re!(en_status, vocab().en_ask_status);
fn punctuation() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src(r"[\s.,?!()\-]+", ""))
}

/// `isFinderQuestion`: "เรียนอะไรดี", "ไม่รู้จะเรียน…": no programme named, so the facet finder opens instead of the resolver.
pub fn is_finder_question(q: &str) -> bool {
    findq().is_match(q) && !patterns().other.is_match(q)
}

/// `isLevelOnlyQuestion`: nothing but a degree level and filler ("ปริญญาโท นานาชาติ ที่เปิดรับ").
pub fn is_level_only_question(q: &str) -> bool {
    let p = patterns();
    if !p.levels.iter().any(|(_, re)| re.is_match(q)) {
        return false;
    }
    // the page rebuilds each level pattern with the `gi` flags and blanks every occurrence
    let mut s = q.to_string();
    for (_, re) in &p.levels {
        s = re.replace_all(&s, " ").into_owned();
    }
    let s = level_fill().replace_all(&s, " ").into_owned();
    punctuation().replace_all(&s, "").is_empty()
}

/// `englishProgrammeAsk`: an English question about a programme's schedule or status, reduced to the programme name. `None` = not one.
pub fn english_programme_ask(q: &str) -> Option<(String, &'static str)> {
    if !crate::intake::is_english(q) {
        return None;
    }
    let topic = if en_schedule().is_match(q) { "schedule" } else if en_status().is_match(q) { "status" } else { return None };
    let blanked = en_fill().replace_all(q, " ").into_owned();
    let name = blanked.chars().map(|c| if matches!(c, '?' | '!' | '.' | ',') { ' ' } else { c }).collect::<String>();
    let name = name.split(|c: char| is_js_space(c)).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ");
    (name.encode_utf16().count() >= 4).then_some((name, topic))
}

/// What the resolver branch decided.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProgrammeOutcome {
    /// one programme: its card, and its code becomes the programme in focus
    Card(String),
    /// several / too broad: a picker, and no programme stays in focus
    Pick,
}

/// The `prog` computation of `_askCore`: the resolver unless the question belongs to the finder; then the English pre-pass.
pub fn resolve_programme_branch(q: &str, catalogue: &Catalogue, skip_resolver: bool) -> Option<ProgrammeOutcome> {
    let as_outcome = |r: crate::resolve::Resolution| match r.kind {
        Kind::One => ProgrammeOutcome::Card(r.codes[0].clone()),
        _ => ProgrammeOutcome::Pick,
    };
    let finder = is_finder_question(q) || is_level_only_question(q);
    if !skip_resolver && !finder {
        if let Some(r) = catalogue.resolve(q, false) {
            return Some(as_outcome(r));
        }
    }
    // QA F54 (page): only a single, clear programme from an English question
    if skip_resolver {
        return None;
    }
    let (name, _topic) = english_programme_ask(q)?;
    catalogue.resolve(&name, false).filter(|r| r.kind == Kind::One).map(as_outcome)
}

/// `isCareerQuestion`: "ทำงานอะไรดี", "อยากทำเกี่ยวกับคอม" - no right answer; the page narrows the official list by an area of interest.
pub fn is_career_question(q: &str) -> bool {
    career().is_match(q) && !patterns().other.is_match(q) && !super::study_intent::names_a_topic(q)
}
