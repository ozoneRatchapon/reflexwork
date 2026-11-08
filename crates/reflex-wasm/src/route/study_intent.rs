//! `hasStudyIntent` and the catalogue-not-ready branch. "Does this read like a question about a programme?" - used while the programme
//! catalogue is still loading (or failed to load), so the page can say so instead of answering a programme question from the wrong place.
use super::vocab::vocab;
use crate::re::compile;
use crate::resolve::patterns::patterns;
use regex_lite::Regex;
use std::sync::OnceLock;

fn not_study() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().not_study))
}
fn study_words() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().study_words))
}
fn career_or_open() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().career_or_open))
}

/// `_P_TOPIC.some(([,re]) => re.test(s))`: the text names a fee or scholarship topic.
pub fn names_a_topic(s: &str) -> bool {
    patterns().topics.iter().any(|(_, re)| re.is_match(s))
}

/// `hasStudyIntent(q)`: no "not about studying" phrase, no other-service word, no fee / scholarship topic, and a study word.
/// The page's `สมัคร(?!สอบ)` ("apply", but not "apply for an exam") is done by blanking "สมัครสอบ" before looking for the word.
pub fn has_study_intent(q: &str) -> bool {
    let s = not_study().replace_all(q, " ").into_owned();
    if patterns().other.is_match(&s) || names_a_topic(&s) {
        return false;
    }
    study_words().is_match(&s.replace("สมัครสอบ", " "))
}

/// The branch: while the catalogue is not usable (`Loading` / `Failed`; `None` = this deployment has no catalogue), a programme-looking question gets the "catalogue not ready" notice.
pub fn catalogue_notice(q: &str) -> bool {
    has_study_intent(q) || names_a_topic(q) || career_or_open().is_match(q)
}
