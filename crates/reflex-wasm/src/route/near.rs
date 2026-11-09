//! `nearSpelling(q, title)` (chatbot.html): how much of the question's core is an approximate substring of a programme title.
//! A slip in a programme name ("กายอุปกณ์") scores close to 1; a shared fragment ("โรงอาหาร") does not. Sellers' edit distance,
//! free start in the title, normalised by the question core's length.
use super::vocab::vocab;
use crate::re::{compile, is_js_space};
use regex_lite::Regex;
use std::sync::OnceLock;

fn core_drop() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().p_core_drop))
}

/// Port of `nearSpelling`: 0 when the core is shorter than 4 characters or the title is empty, else `1 - distance / core length`.
pub fn near_spelling(q: &str, title: &str) -> f64 {
    let lowered = q.to_lowercase();
    let a: Vec<char> = core_drop().replace_all(&lowered, "").chars().collect();
    let b: Vec<char> = title.to_lowercase().chars().filter(|c| !is_js_space(*c)).collect();
    if a.len() < 4 || b.is_empty() {
        return 0.0;
    }
    // row 0 is all zeros: the match may start anywhere in the title
    let mut prev = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for j in 1..=b.len() {
            let sub = prev[j - 1] + usize::from(*ca != b[j - 1]);
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(sub);
        }
        prev = cur;
    }
    let best = prev.iter().copied().min().unwrap_or(0);
    1.0 - best as f64 / a.len() as f64
}
