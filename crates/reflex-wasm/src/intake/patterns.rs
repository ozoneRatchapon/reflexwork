//! The intake patterns, read from the installed pack's `vocab.json` (plan 015 step 2; they used to be generated from chatbot.html).
use crate::re::compile;
use crate::route::vocab::vocab;
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
    P.get_or_init(|| {
        let v = vocab();
        Patterns {
            issues: v.intake_issues.iter().map(|i| (i.category.as_str(), i.label.as_str(), compile(&i.re))).collect(),
            not_personal: compile(&v.not_personal),
            advice: compile(&v.advice),
            factual: compile(&v.factual),
        }
    })
}
