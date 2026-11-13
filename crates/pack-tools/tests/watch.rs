//! Plan 019 item 4.3: a moved date on the cited page names the entry; a page repeating another page's schedule is not "new";
//! a refused page is reported, not counted as a change.

use pack_tools::dates::parse_ymd;
use pack_tools::entry::parse_entry;
use pack_tools::types::Entry;
use pack_tools::watch::{by_source, compare, markdown, pack_dates, Fetched, PageReport};

const URL: &str = "https://college.test/schedule/";

fn entry(name: &str, url: &str, body: &str) -> Entry {
    parse_entry(name, &format!("---\ntitle: \"t {name}\"\nsource_url: \"{url}\"\napproval_status: \"draft\"\n---\n{body}\n")).unwrap()
}

fn entries() -> Vec<Entry> {
    vec![
        entry("r1.md", URL, "- ปิดรับ: 19 ก.ย. 2569\n- รายงานตัว: 31 ต.ค. – 6 พ.ย. 2569"),
        entry("majors.md", "https://college.test/majors/", "สาขา: แจ๊ส (Jazz), ธุรกิจดนตรี (Music Business), ดนตรีไทย (Thai & Eastern Music)"),
        entry("local.md", "knowledge-only", "no web source"),
    ]
}

const PAGE: &str = "<p>Deadline Sat. 19 Sep. 2026</p><p>Report 31 Oct. &ndash; 6 Nov. 2026</p><p>Round 2 deadline Sat. 7 Nov. 2026</p>";

#[test]
fn unchanged_page_reports_nothing_and_old_dates_are_not_new() {
    let es = entries();
    let today = parse_ymd("2026-11-14").unwrap();
    let sources = by_source(&es);
    assert_eq!(sources.len(), 2, "an entry without an http(s) source is not watched");
    let r = compare(URL, &sources[URL], &Fetched::Html(PAGE.to_string()), &pack_dates(&es), today);
    assert!(!r.changed(), "7 Nov. 2026 is before today, so it is not a new date: {r:?}");
}

#[test]
fn moved_deadline_names_the_entry_and_the_new_date() {
    let es = entries();
    let today = parse_ymd("2026-09-01").unwrap();
    let moved = PAGE.replace("19 Sep. 2026", "26 Sep. 2026");
    let r = compare(URL, &by_source(&es)[URL], &Fetched::Html(moved), &pack_dates(&es), today);
    let PageReport::Read { stale, new_dates, .. } = &r else { panic!("{r:?}") };
    assert_eq!(stale.len(), 1);
    assert_eq!(stale[0].file_name, "r1.md");
    assert_eq!(stale[0].missing_dates, ["2026-09-19"]);
    assert_eq!(new_dates, &["2026-09-26", "2026-11-07"]);
    let md = markdown("pack", &[r]);
    assert!(md.contains("`r1.md`: dates not on the page: 2026-09-19;"));
    assert!(!md.contains("2026-09-01"), "the report has no run date, so an unchanged week is no diff");
}

#[test]
fn names_match_ignoring_case_and_ampersand() {
    let es = entries();
    let url = "https://college.test/majors/";
    let page = Fetched::Html("<li>JAZZ</li><li>Thai and Eastern Music</li>".to_string());
    let r = compare(url, &by_source(&es)[url], &page, &pack_dates(&es), 0);
    let PageReport::Read { stale, .. } = &r else { panic!("{r:?}") };
    assert_eq!(stale[0].missing_names, ["Music Business"]);
}

#[test]
fn refused_page_is_reported_not_counted_as_change() {
    let es = entries();
    let r = compare(URL, &by_source(&es)[URL], &Fetched::Refused("HTTP 403".to_string()), &pack_dates(&es), 0);
    assert!(!r.changed());
    let md = markdown("pack", &[r]);
    assert!(md.contains("Could not be read (HTTP 403); not retried another way. Entries citing it: r1.md"));
    assert!(md.contains("0 pages read, 0 differ from their entries, 1 could not be read."));
}
