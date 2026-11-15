//! Plan 019 item 4.2: which entries are past `valid_to`, which end within the warning window, and which `valid_to` is not a date.
//! A report, not a gate: CI shows it as warnings (an expired entry still answers, with the page's "may be out of date" note).

use crate::dates::{parse_ymd, validity};
use crate::report::{line, Style};
use crate::types::{Entry, Validity};

/// One dated entry in the report.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dated {
    pub file_name: String,
    pub valid_to: String,
    /// Days from today to `valid_to` (negative: already past).
    pub days_left: i64,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ExpiryReport {
    pub expired: Vec<Dated>,
    pub ending_soon: Vec<Dated>,
    /// `valid_to` present but not a real `YYYY-MM-DD`.
    pub bad_dates: Vec<(String, String)>,
    pub current: usize,
    pub undated: usize,
}

impl ExpiryReport {
    pub fn is_clean(&self) -> bool {
        self.expired.is_empty() && self.ending_soon.is_empty() && self.bad_dates.is_empty()
    }
}

pub fn report(entries: &[Entry], today: i64, soon_days: i64) -> ExpiryReport {
    let mut r = ExpiryReport::default();
    for e in entries {
        let Some(raw) = e.valid_to.as_deref() else {
            r.undated += 1;
            continue;
        };
        let Some(end) = parse_ymd(raw) else {
            r.bad_dates.push((e.file_name.clone(), raw.to_string()));
            continue;
        };
        let dated = Dated { file_name: e.file_name.clone(), valid_to: raw.to_string(), days_left: end - today };
        match validity(Some(raw), today, soon_days) {
            Validity::Expired => r.expired.push(dated),
            Validity::EndingSoon => r.ending_soon.push(dated),
            Validity::Current | Validity::Unknown => r.current += 1,
        }
    }
    r.expired.sort_by_key(|d| d.days_left);
    r.ending_soon.sort_by_key(|d| d.days_left);
    r
}

/// The report as lines; `dir` is the knowledge folder as shown to the reader.
pub fn format(r: &ExpiryReport, dir: &str, style: Style) -> String {
    let line = |file: &str, msg: String| line(style, dir, file, &msg);
    let mut out = format!(
        "{dir}: {} expired, {} ending within the window, {} bad valid_to, {} current, {} without valid_to\n",
        r.expired.len(),
        r.ending_soon.len(),
        r.bad_dates.len(),
        r.current,
        r.undated
    );
    for d in &r.expired {
        out.push_str(&line(&d.file_name, format!("expired {} ({} days ago): update the entry or its valid_to", d.valid_to, -d.days_left)));
    }
    for d in &r.ending_soon {
        out.push_str(&line(&d.file_name, format!("valid_to {} ends in {} days", d.valid_to, d.days_left)));
    }
    for (file, raw) in &r.bad_dates {
        out.push_str(&line(file, format!("valid_to \"{raw}\" is not a YYYY-MM-DD date (the build refuses it)")));
    }
    out
}
