//! `topicCore` and `topicPicks` (chatbot.html): a short question around one topic word ("มีทุนไหม", "ทุน") names no programme, so the
//! page offers the manual entries whose TITLE holds that word (1 to 12 of them). No AI, no guess.
use super::vocab::vocab;
use crate::re::{compile, is_js_space};
use regex_lite::Regex;
use std::sync::OnceLock;

fn head() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().topic_head))
}
fn tail() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile(&vocab().topic_tail))
}

/// Port of `topicCore`: whitespace removed, then the request words peeled off both ends until nothing changes.
pub fn topic_core(q: &str) -> String {
    let mut s: String = q.chars().filter(|c| !is_js_space(*c)).collect();
    while !s.is_empty() {
        let before = s.clone();
        s = head().replace(&s, "").into_owned();
        s = tail().replace(&s, "").into_owned();
        if s == before {
            break;
        }
    }
    s
}

/// The `topicPicks` hits: the indexes of the titles that hold the core (whitespace removed, lowercased); empty when the core is under 3
/// characters. At most 13 are collected (13 = too many to offer).
pub fn topic_hits<'a>(q: &str, titles: impl Iterator<Item = &'a str>) -> Vec<usize> {
    let core = topic_core(q);
    if core.chars().count() < 3 {
        return Vec::new();
    }
    let needle = core.to_lowercase();
    titles
        .enumerate()
        .filter(|(_, t)| t.chars().filter(|c| !is_js_space(*c)).collect::<String>().to_lowercase().contains(&needle))
        .map(|(i, _)| i)
        .take(13)
        .collect()
}

/// The `topicPicks` test: the core sits inside 1 to 12 entry titles.
pub fn topic_picks<'a>(q: &str, titles: impl Iterator<Item = &'a str>) -> bool {
    (1..=12).contains(&topic_hits(q, titles).len())
}
