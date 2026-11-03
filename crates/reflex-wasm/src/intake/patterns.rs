use super::patterns_src::{ADVICE, FACTUAL, ISSUES, NOT_PERSONAL};
use crate::re::compile;
use regex_lite::Regex;
use std::sync::OnceLock;

pub struct Patterns {
    /// Category, label and the trigger pattern; the first category whose pattern matches wins.
    pub issues: Vec<(&'static str, &'static str, Regex)>,
    pub not_personal: Regex,
    pub advice: Regex,
    pub factual: Regex,
}

pub fn patterns() -> &'static Patterns {
    static P: OnceLock<Patterns> = OnceLock::new();
    P.get_or_init(|| Patterns {
        issues: ISSUES.iter().map(|(c, l, r)| (*c, *l, compile(r))).collect(),
        not_personal: compile(&NOT_PERSONAL),
        advice: compile(&ADVICE),
        factual: compile(&FACTUAL),
    })
}
