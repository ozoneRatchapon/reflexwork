//! Fee questions and the "which aspect of the programme in focus is asked" reader: `followUpAspect`, `isGenericFeeQuestion`, `_P_FREEQ`.
use super::patterns_src::{ASPECT_DOCS, ASPECT_ELIG, ASPECT_ENGLISH, ASPECT_SCHEDULE, ASPECT_STATUS, FEE_FILLER, FEE_WORDS, FREE_Q, GENERAL_WORDS, PROGRAMME_CODE};
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
lazy_re!(free_q, FREE_Q);
lazy_re!(programme_code, PROGRAMME_CODE);
lazy_re!(general_words, GENERAL_WORDS);
lazy_re!(fee_words, FEE_WORDS);
lazy_re!(fee_filler, FEE_FILLER);

fn aspects() -> &'static Vec<(&'static str, Regex)> {
    static R: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    R.get_or_init(|| {
        let t = &patterns().topics;   // _P_TOPIC: fee, scholarship
        let topic = |key: &str| t.iter().find(|(k, _)| *k == key).map(|(_, re)| re.clone()).expect("topic pattern");
        vec![
            ("fee", topic("fee")),
            ("scholarship", topic("scholarship")),
            ("docs", compile(&ASPECT_DOCS)),
            ("elig", compile(&ASPECT_ELIG)),
            ("english", compile(&ASPECT_ENGLISH)),
            ("schedule", compile(&ASPECT_SCHEDULE)),
            ("status", compile(&ASPECT_STATUS)),
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
