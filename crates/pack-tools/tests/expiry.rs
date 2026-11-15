//! Plan 019 item 4.2: the expiry report sorts entries into expired / ending soon / bad date / current / undated.

use pack_tools::dates::parse_ymd;
use pack_tools::entry::parse_entry;
use pack_tools::expiry::{format, report};
use pack_tools::report::Style;

fn entry(name: &str, valid_to: Option<&str>) -> pack_tools::types::Entry {
    let vt = valid_to.map(|v| format!("valid_to: \"{v}\"\n")).unwrap_or_default();
    parse_entry(name, &format!("---\ntitle: \"t\"\napproval_status: \"draft\"\n{vt}---\nbody\n")).unwrap()
}

#[test]
fn sorts_entries_by_validity() {
    let today = parse_ymd("2026-11-14").unwrap();
    let entries = [
        entry("old.md", Some("2026-11-06")),
        entry("older.md", Some("2026-10-01")),
        entry("soon.md", Some("2026-11-20")),
        entry("later.md", Some("2027-01-01")),
        entry("typo.md", Some("2026-13-01")),
        entry("none.md", None),
    ];
    let r = report(&entries, today, 7);
    assert_eq!(r.expired.iter().map(|d| d.file_name.as_str()).collect::<Vec<_>>(), ["older.md", "old.md"], "oldest first");
    assert_eq!(r.expired[1].days_left, -8);
    assert_eq!(r.ending_soon.len(), 1);
    assert_eq!(r.ending_soon[0].days_left, 6);
    assert_eq!(r.bad_dates, [("typo.md".to_string(), "2026-13-01".to_string())]);
    assert_eq!((r.current, r.undated), (1, 1));
    assert!(!r.is_clean());
    let gh = format(&r, "k", Style::Github);
    assert!(gh.contains("::warning file=k/old.md::expired 2026-11-06 (8 days ago)"));
    assert_eq!(gh.matches("::warning").count(), 4);
    assert!(report(&[entry("none.md", None)], today, 7).is_clean());
}
