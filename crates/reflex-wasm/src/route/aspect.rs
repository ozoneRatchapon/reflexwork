//! Fee questions and the "which aspect of the programme in focus is asked" reader: `followUpAspect`, `isGenericFeeQuestion`, `_P_FREEQ`.
use super::vocab::vocab;
use crate::re::{compile, is_js_space};
use crate::resolve::patterns::patterns;
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
lazy_re!(free_q, vocab().free_q);
lazy_re!(programme_code, vocab().programme_code);
lazy_re!(general_words, vocab().general_words);
lazy_re!(fee_words, vocab().fee_words);
lazy_re!(fee_filler, vocab().fee_filler);
lazy_re!(tuition, vocab().tuition);
lazy_re!(nontuition, vocab().nontuition);
lazy_re!(free_study_words, vocab().freestudy);

fn aspects() -> &'static Vec<(&'static str, Regex)> {
    static R: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    R.get_or_init(|| {
        let t = &patterns().topics;   // _P_TOPIC: fee, scholarship
        let topic = |key: &str| t.iter().find(|(k, _)| *k == key).map(|(_, re)| re.clone()).expect("topic pattern");
        vec![
            ("fee", topic("fee")),
            ("scholarship", topic("scholarship")),
            ("docs", compile(&vocab().aspect_docs)),
            ("elig", compile(&vocab().aspect_elig)),
            ("english", compile(&vocab().aspect_english)),
            ("schedule", compile(&vocab().aspect_schedule)),
            ("status", compile(&vocab().aspect_status)),
        ]
    })
}

/// `_P_TOPIC[0][1].test(q)`: the question names a fee.
pub fn names_a_fee(q: &str) -> bool {
    patterns().topics.iter().find(|(k, _)| *k == "fee").map(|(_, re)| re.is_match(q)).unwrap_or(false)
}

/// `_P_FREEQ.test(q)`: "ฟรี" / free of charge.
pub fn asks_if_free(q: &str) -> bool {
    free_q().is_match(q)
}

/// `_pLevel(q)` is non-empty: the text names a degree level.
fn names_a_level(q: &str) -> bool {
    patterns().levels.iter().any(|(_, re)| re.is_match(q))
}

/// `followUpAspect(q)`: a short follow-up that names only an aspect ("แล้วค่าเทอมล่ะ", "ต้องใช้เอกสารอะไร") of the programme just shown. `None` = not one.
pub fn follow_up_aspect(q: &str) -> Option<&'static str> {
    let raw = q.trim_matches(|c: char| is_js_space(c));
    if raw.is_empty() || raw.chars().filter(|c| !is_js_space(*c)).map(|c| c.len_utf16()).sum::<usize>() > 40 {
        return None;
    }
    if patterns().other.is_match(raw) || names_a_level(raw) || programme_code().is_match(raw) || general_words().is_match(raw) {
        return None;
    }
    aspects().iter().find(|(_, re)| re.is_match(raw)).map(|(k, _)| *k)
}

/// `isGenericFeeQuestion`: a fee question with nothing but the fee word, a level word and filler (no programme or field of its own).
pub fn is_generic_fee_question(text: &str) -> bool {
    let t = text.to_lowercase();
    let a = fee_words().replace_all(&t, "").into_owned();
    let b = fee_filler().replace_all(&a, "").into_owned();
    b.chars().filter(|c| !(is_js_space(*c) || matches!(c, '?' | '!' | '.' | ','))).count() == 0
}

/// `isTuitionQuestion`: the programme's own fee, not an exam / service fee (tuition words, or a fee word without an exam / application / transfer subject).
pub fn is_tuition_question(q: &str) -> bool {
    tuition().is_match(q) || (names_a_fee(q) && !nontuition().is_match(q))
}

/// `_P_FREESTUDY.test(q)`: "ฟรี" about studying ("เรียนฟรีไหม", "ปริญญาโทฟรี").
pub fn mentions_free_study(q: &str) -> bool {
    free_study_words().is_match(q)
}
