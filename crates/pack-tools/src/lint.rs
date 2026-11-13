//! Plan 019 item 4.4: warnings an owner should see before approving a pack. None of them stops a build (the index builder already
//! refuses what is structurally wrong); they point at entries that will answer badly.

use std::collections::{BTreeSet, HashMap};

use crate::answer::{unserved, Why, ANSWER_CAP};
use crate::dates::{civil_from_days, parse_ymd};
use crate::facts::dates_in;
use crate::types::Entry;

/// Titles at least this similar (Dice over character bigrams) compete for the same questions (plan 018: shared words dilute a match).
pub const SIMILAR_TITLES: f64 = 0.8;

#[derive(Debug, Clone, PartialEq)]
pub enum Finding {
    EmptyTitle,
    DuplicateTitle { other: String },
    SimilarTitle { other: String, score: f64 },
    EmptyKeywordLine { line: usize },
    /// A second `คำค้น…:` line: the index builder reads only the first, so these keywords never reach search.
    ExtraKeywordLine { line: usize, first: usize },
    EmptyBody,
    /// Text the chat never shows: one `##` section serves only its first paragraph (`extract_answer` in the index builder).
    UnservedParagraphs { line: usize, count: usize },
    /// Sections the chat never shows: a multi-section answer is cut at `ANSWER_CAP` characters, on a section boundary.
    CappedSections { line: usize, count: usize },
    NoSource,
    /// The answer names a date later than `valid_to`: the entry would show as out of date while its own facts are still ahead.
    DateAfterValidTo { date: String, valid_to: String },
}

impl Finding {
    pub fn message(&self) -> String {
        match self {
            Finding::EmptyTitle => "no title (the title is the question this entry answers)".to_string(),
            Finding::DuplicateTitle { other } => format!("same title as {other}"),
            Finding::SimilarTitle { other, score } => {
                format!("title is {:.0}% like {other}'s: they compete for the same questions; make each title say what only it answers", score * 100.0)
            }
            Finding::EmptyKeywordLine { line } => format!("line {line}: keyword line with no keywords"),
            Finding::ExtraKeywordLine { line, first } => {
                format!("line {line}: second keyword line; the build reads only line {first}'s, so merge them into one line")
            }
            Finding::EmptyBody => "no answer text after the frontmatter".to_string(),
            Finding::UnservedParagraphs { line, count } => format!(
                "line {line}: {count} paragraph(s) the chat never shows (one section serves only its first paragraph): join them with single line breaks, or give each its own ## heading"
            ),
            Finding::CappedSections { line, count } => format!(
                "line {line}: {count} paragraph(s) the chat never shows (the answer stops at {ANSWER_CAP} characters, at a section boundary): shorten the sections before it, or split the entry"
            ),
            Finding::NoSource => "no source_url (the answer cannot show where it comes from)".to_string(),
            Finding::DateAfterValidTo { date, valid_to } => {
                format!("the answer mentions {date}, after valid_to {valid_to}: set valid_to to the last date the answer is about")
            }
        }
    }
}

/// Normalise a title for comparison: lower case, letters and digits only.
fn norm(title: &str) -> String {
    title.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

fn bigrams(s: &str) -> Vec<(char, char)> {
    let cs: Vec<char> = s.chars().collect();
    let mut v: Vec<(char, char)> = cs.windows(2).map(|w| (w[0], w[1])).collect();
    v.sort_unstable();
    v
}

/// Dice coefficient over character bigram multisets (works for Thai, which has no spaces between words).
pub fn similarity(a: &str, b: &str) -> f64 {
    let (x, y) = (bigrams(a), bigrams(b));
    if x.is_empty() || y.is_empty() {
        return 0.0;
    }
    let (mut i, mut j, mut common) = (0, 0, 0usize);
    while i < x.len() && j < y.len() {
        match x[i].cmp(&y[j]) {
            std::cmp::Ordering::Equal => {
                common += 1;
                i += 1;
                j += 1;
            }
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
        }
    }
    2.0 * common as f64 / (x.len() + y.len()) as f64
}

/// A keyword line split into (key, keywords): `คำค้น…:` (what the index builder reads) or `keywords:`.
fn keyword_line(line: &str) -> Option<(&str, &str)> {
    let (key, rest) = line.trim().split_once(':')?;
    (key.starts_with("คำค้น") || key.eq_ignore_ascii_case("keywords")).then_some((key, rest.trim()))
}

/// Keyword-line findings for one entry: empty lines, and any `คำค้น…:` line after the first (the builder's `re.search` takes one).
fn keyword_findings(lines: &[String]) -> Vec<Finding> {
    let mut out = Vec::new();
    let mut first: Option<usize> = None;
    for (n, (key, rest)) in lines.iter().enumerate().filter_map(|(n, l)| keyword_line(l).map(|k| (n + 1, k))) {
        if rest.is_empty() {
            out.push(Finding::EmptyKeywordLine { line: n });
        }
        match (key.starts_with("คำค้น"), first) {
            (false, _) => {}
            (true, None) => first = Some(n),
            (true, Some(first)) => out.push(Finding::ExtraKeywordLine { line: n, first }),
        }
    }
    out
}

/// Same words in the same places except one, numbers ignored: a series (one entry per round, level or term), not a duplicate.
fn siblings(a: &[String], b: &[String]) -> bool {
    a.len() == b.len() && a.iter().zip(b).filter(|(x, y)| x != y).count() <= 1
}

/// Findings per file name, in file order. Entries with no findings are left out.
pub fn lint(entries: &[Entry]) -> Vec<(String, Vec<Finding>)> {
    let mut found: HashMap<&str, Vec<Finding>> = HashMap::new();
    let normed: Vec<String> = entries.iter().map(|e| norm(&e.title)).collect();
    for (i, e) in entries.iter().enumerate() {
        let f = found.entry(e.file_name.as_str()).or_default();
        if normed[i].is_empty() {
            f.push(Finding::EmptyTitle);
        }
        if e.body.is_empty() {
            f.push(Finding::EmptyBody);
        }
        if e.source_url.is_empty() {
            f.push(Finding::NoSource);
        }
        f.extend(keyword_findings(&e.lines));
        f.extend(unserved(&e.lines, Why::OneSection).map(|(line, count)| Finding::UnservedParagraphs { line, count }));
        f.extend(unserved(&e.lines, Why::OverCap).map(|(line, count)| Finding::CappedSections { line, count }));
        if let Some(end) = e.valid_to.as_deref().and_then(parse_ymd) {
            if let Some(&latest) = dates_in(&e.body).last().filter(|&&d| d > end) {
                f.push(Finding::DateAfterValidTo { date: civil_from_days(latest), valid_to: civil_from_days(end) });
            }
        }
    }
    // pairs: identical titles, or near-identical ones that are not siblings (round 1 / round 2, ภาคต้น / ภาคปลาย are intended)
    let words: Vec<Vec<String>> = entries.iter().map(|e| e.title.split_whitespace().map(|w| norm(w).replace(|c: char| c.is_ascii_digit(), "")).collect()).collect();
    for i in 0..entries.len() {
        for j in i + 1..entries.len() {
            if normed[i].is_empty() || normed[j].is_empty() {
                continue;
            }
            let (a, b) = (&entries[i].file_name, &entries[j].file_name);
            let finding = match (normed[i] == normed[j], siblings(&words[i], &words[j])) {
                (true, _) => Some((Finding::DuplicateTitle { other: b.clone() }, Finding::DuplicateTitle { other: a.clone() })),
                (false, true) => None,
                (false, false) => {
                    let score = similarity(&normed[i], &normed[j]);
                    (score >= SIMILAR_TITLES).then(|| {
                        (Finding::SimilarTitle { other: b.clone(), score }, Finding::SimilarTitle { other: a.clone(), score })
                    })
                }
            };
            if let Some((fa, fb)) = finding {
                found.entry(a.as_str()).or_default().push(fa);
                found.entry(b.as_str()).or_default().push(fb);
            }
        }
    }
    let order: BTreeSet<&str> = entries.iter().map(|e| e.file_name.as_str()).collect();
    order.into_iter().filter_map(|name| found.remove(name).filter(|f| !f.is_empty()).map(|f| (name.to_string(), f))).collect()
}
