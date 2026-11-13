//! Plan 019 item 4.3: re-read the pages a pack cites and name the entries whose facts the page does not show (any more).
//! An entry's facts are its full dates and the English names it gives in parentheses; the page is compared as visible text.
//! A page that cannot be read (refused, bot check, timeout) is reported as such and never worked around.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use crate::dates::civil_from_days;
use crate::facts::{dates_in, html_text, paren_names};
use crate::types::Entry;

/// What fetching one URL gave.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fetched {
    Html(String),
    /// Why it could not be read ("HTTP 403", "curl: timeout", ...).
    Refused(String),
}

/// One entry stating facts its cited page does not show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stale {
    pub file_name: String,
    pub missing_dates: Vec<String>,
    pub missing_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PageReport {
    Refused { url: String, reason: String, files: Vec<String> },
    Read {
        url: String,
        stale: Vec<Stale>,
        /// Dates from today on that the page shows and no entry citing it has (a new round, a moved deadline).
        new_dates: Vec<String>,
    },
}

impl PageReport {
    pub fn changed(&self) -> bool {
        match self {
            PageReport::Refused { .. } => false,
            PageReport::Read { stale, new_dates, .. } => !stale.is_empty() || !new_dates.is_empty(),
        }
    }
}

/// Entries grouped by the page they cite (entries without an http(s) source are not watched).
pub fn by_source(entries: &[Entry]) -> BTreeMap<String, Vec<&Entry>> {
    let mut map: BTreeMap<String, Vec<&Entry>> = BTreeMap::new();
    for e in entries.iter().filter(|e| e.source_url.starts_with("https://") || e.source_url.starts_with("http://")) {
        map.entry(e.source_url.clone()).or_default().push(e);
    }
    map
}

/// Lower case, `&` read as `and`, single spaces: "Thai & Eastern  Music" matches "thai and eastern music".
fn norm_name(s: &str) -> String {
    s.to_lowercase().replace('&', " and ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Every date any entry of the pack states: a page that repeats another page's schedule shows no "new" dates for it.
pub fn pack_dates(entries: &[Entry]) -> BTreeSet<i64> {
    entries.iter().flat_map(|e| dates_in(&e.body)).collect()
}

/// Compare the entries citing `url` with what the page shows. New dates are those from `today` on that are not in `known`
/// (see [`pack_dates`]).
pub fn compare(url: &str, entries: &[&Entry], fetched: &Fetched, known: &BTreeSet<i64>, today: i64) -> PageReport {
    let html = match fetched {
        Fetched::Refused(reason) => {
            return PageReport::Refused {
                url: url.to_string(),
                reason: reason.clone(),
                files: entries.iter().map(|e| e.file_name.clone()).collect(),
            }
        }
        Fetched::Html(h) => h,
    };
    let text = html_text(html);
    let page_dates = dates_in(&text);
    let page_names = norm_name(&text);
    let mut stale = Vec::new();
    for e in entries {
        let dates = dates_in(&e.body);
        let missing_dates: Vec<String> = dates.difference(&page_dates).map(|&d| civil_from_days(d)).collect();
        let missing_names: Vec<String> =
            paren_names(&e.body).into_iter().filter(|n| !page_names.contains(&norm_name(n))).collect();
        if !missing_dates.is_empty() || !missing_names.is_empty() {
            stale.push(Stale { file_name: e.file_name.clone(), missing_dates, missing_names });
        }
    }
    let new_dates = page_dates.iter().filter(|&&d| d >= today && !known.contains(&d)).map(|&d| civil_from_days(d)).collect();
    PageReport::Read { url: url.to_string(), stale, new_dates }
}

/// The report as Markdown. It holds no run date on purpose: the workflow commits it as `site_watch.md` and opens a pull request
/// only when it differs from last week's, so a gap that stays the same is reported once.
pub fn markdown(pack: &str, reports: &[PageReport]) -> String {
    let changed = reports.iter().filter(|r| r.changed()).count();
    let refused = reports.iter().filter(|r| matches!(r, PageReport::Refused { .. })).count();
    let mut out = format!(
        "# Site watch: {pack}\n\n{} pages read, {changed} differ from their entries, {refused} could not be read.\n\
Facts compared: full dates and the English names entries give in parentheses. Nothing here edits an entry: the owner checks the page,\n\
updates the entry and its `valid_to`, and approves again.\n",
        reports.len() - refused
    );
    for r in reports {
        match r {
            PageReport::Refused { url, reason, files } => {
                let _ = write!(out, "\n## {url}\nCould not be read ({reason}); not retried another way. Entries citing it: {}\n", files.join(", "));
            }
            PageReport::Read { url, stale, new_dates } if r.changed() => {
                let _ = write!(out, "\n## {url}\n");
                for s in stale {
                    let _ = write!(out, "- `{}`:", s.file_name);
                    if !s.missing_dates.is_empty() {
                        let _ = write!(out, " dates not on the page: {};", s.missing_dates.join(", "));
                    }
                    if !s.missing_names.is_empty() {
                        let _ = write!(out, " names not on the page: {};", s.missing_names.join(", "));
                    }
                    out.push('\n');
                }
                if !new_dates.is_empty() {
                    let _ = writeln!(out, "- dates on the page that no entry has: {}", new_dates.join(", "));
                }
            }
            PageReport::Read { .. } => {}
        }
    }
    out
}
