//! "มีสาขาแจ๊สไหม": a name the question asks about that sits only in an entry's BODY, as an item of a list ("มี 9 สาขา: ..., แจ๊ส (Jazz)").
//! The search reads titles and keywords only, so such a question finds nothing; this step looks the name up in the body lists instead
//! (plan 019 Phase 2). It runs only after the search gave up (`Action::Escalate`), so a title or keyword hit always wins over it.
//!
//! A list is the text after the first `:` of a line, split on commas, with at least `MIN_ITEMS` items. An item gives its text outside
//! the brackets and each bracketed part as names ("แจ๊ส (Jazz)" -> "แจ๊ส", "jazz"). Names compare lowercased, without spaces.
use super::manual::ManualEntry;

/// Fewer items than this after a `:` is a sentence ("ติดต่อ: 02 800 2525"), not a list of names.
const MIN_ITEMS: usize = 3;
/// A name shorter than this (in chars) is too loose to look up ("ป.", "MA").
const MIN_CHARS: usize = 3;

/// The entries whose body lists the longest name the question contains (entry order). Empty when the question names no list item.
pub fn entries_naming<'a>(q: &str, entries: &'a [ManualEntry]) -> Vec<&'a ManualEntry> {
    let q = squash(q);
    let named: Vec<(&ManualEntry, usize)> = entries
        .iter()
        .filter_map(|e| list_names(&e.answer).filter(|n| q.contains(n.as_str())).map(|n| n.chars().count()).max().map(|len| (e, len)))
        .collect();
    let Some(longest) = named.iter().map(|(_, len)| *len).max() else {
        return Vec::new();
    };
    named.into_iter().filter(|(_, len)| *len == longest).map(|(e, _)| e).collect()
}

/// Every name of every list in `body`.
pub fn list_names(body: &str) -> impl Iterator<Item = String> + '_ {
    body.lines()
        .filter_map(|line| line.split_once(':').map(|(_, rest)| rest))
        .map(|rest| rest.split(',').collect::<Vec<_>>())
        .filter(|items| items.len() >= MIN_ITEMS)
        .flatten()
        .flat_map(item_names)
        .filter(|n| n.chars().count() >= MIN_CHARS && !n.chars().all(|c| c.is_ascii_digit()))
}

/// "แจ๊ส (Jazz)" -> ["แจ๊ส", "jazz"]; "Thai Music (Performance Major)" -> ["thaimusic", "performancemajor"].
fn item_names(item: &str) -> Vec<String> {
    let mut outside = String::new();
    let mut names = Vec::new();
    let mut inner: Option<String> = None;
    for c in item.chars() {
        match (c, inner.as_mut()) {
            ('(', None) => inner = Some(String::new()),
            (')', Some(_)) => names.extend(inner.take().map(|s| squash(&s))),
            (c, Some(s)) => s.push(c),
            (c, None) => outside.push(c),
        }
    }
    names.insert(0, squash(&outside));
    names.retain(|n| !n.is_empty());
    names
}

/// Lowercased, spaces removed: "Popular Music" and "popularmusic" are one name.
fn squash(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect()
}
