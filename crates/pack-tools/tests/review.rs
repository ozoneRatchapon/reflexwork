//! Plan 019 item 4.1: the review page shows every entry, escapes what it shows, and its patch applies with `git apply`.

use std::path::{Path, PathBuf};
use std::process::Command;

use pack_tools::dates::{civil_from_days, parse_ymd, validity};
use pack_tools::entry::{parse_entry, read_pack};
use pack_tools::patch::approve_patch;
use pack_tools::review::{render, ReviewInput};
use pack_tools::types::{Status, Validity};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

const SAMPLE: &str = "---\ntitle: \"สมัครรอบ 1 <b>เมื่อไร</b>\"\nsource_url: \"javascript:alert(1)\"\napproval_status: \"draft\"\nvalid_to: \"2026-11-20\"\n---\n## หัวข้อ\n\nคำตอบ <script>x</script>\n";

#[test]
fn parses_frontmatter_like_the_index_builder() {
    let e = parse_entry("a.md", SAMPLE).unwrap();
    assert_eq!(e.title, "สมัครรอบ 1 <b>เมื่อไร</b>");
    assert_eq!(e.status, Status::Draft);
    assert_eq!(e.status_line, Some(3));
    assert_eq!(e.valid_to.as_deref(), Some("2026-11-20"));
    assert!(e.body.starts_with("## หัวข้อ"));
    assert!(parse_entry("b.md", "no frontmatter").is_err());
    assert!(parse_entry("c.md", "---\ntitle: x\n").is_err());
}

#[test]
fn dates_round_trip_and_classify() {
    let d = parse_ymd("2026-11-14").unwrap();
    assert_eq!(civil_from_days(d), "2026-11-14");
    assert_eq!(parse_ymd("2026-02-30"), None);
    assert_eq!(parse_ymd("14/11/2026"), None);
    assert_eq!(validity(Some("2026-11-13"), d, 7), Validity::Expired);
    assert_eq!(validity(Some("2026-11-14"), d, 7), Validity::EndingSoon);
    assert_eq!(validity(Some("2026-11-20"), d, 7), Validity::EndingSoon);
    assert_eq!(validity(Some("2026-11-21"), d, 7), Validity::Current);
    assert_eq!(validity(None, d, 7), Validity::Unknown);
}

#[test]
fn page_escapes_content_and_never_links_a_non_web_source() {
    let e = parse_entry("a.md", SAMPLE).unwrap();
    let html = render(&ReviewInput { agency_name: "A&B", entries: &[e], path_prefix: "k", today: parse_ymd("2026-11-14").unwrap() });
    assert!(!html.contains("<b>เมื่อไร"), "title is escaped");
    assert!(!html.contains("<script>x"), "body is escaped");
    assert!(!html.contains("href=\"javascript:"), "a javascript: source is not a link");
    assert!(html.contains("A&amp;B"));
    assert!(html.contains("connect-src 'none'"), "the page cannot send anything");
    assert!(!html.contains(" onclick="), "no inline handlers");
    assert_eq!(html.matches("data-i=\"0\"").count(), 1, "the draft has a tick");
}

/// Plan 019 5.2: the page marks what the chat drops (one `##` section serves only its first paragraph), as pack-lint warns.
#[test]
fn page_marks_paragraphs_the_chat_never_shows() {
    let head = "---\ntitle: \"t\"\napproval_status: \"draft\"\n---\n## t\nคำค้น: k\n\n";
    let split = parse_entry("a.md", &format!("{head}served <i>\n\ndropped one\nstill dropped\n\ndropped two\n")).unwrap();
    let joined = parse_entry("b.md", &format!("{head}line one\nline two\n")).unwrap();
    let html = render(&ReviewInput { agency_name: "A", entries: &[split, joined], path_prefix: "k", today: parse_ymd("2026-11-14").unwrap() });
    assert!(html.contains("served &lt;i&gt;\n"), "the served paragraph is shown as written, escaped, unmarked");
    assert!(html.contains("<span class=\"lost\">dropped one\nstill dropped</span>"), "a dropped paragraph is marked whole");
    assert!(html.contains("<span class=\"lost\">dropped two</span>"));
    assert_eq!(html.matches("class=\"lost\"").count(), 2, "the one-paragraph entry has no mark");
    assert_eq!(html.matches("<dt>แชทไม่แสดง</dt><dd class=\"warn\">2 ย่อหน้า: หัวข้อเดียว").count(), 1, "only the split entry says how many, and why");
    assert!(html.contains("แชทไม่แสดงบางย่อหน้า 1 "), "the header counts entries that lose text");
}

#[test]
fn approved_and_statusless_entries_have_no_patch() {
    let approved = parse_entry("a.md", &SAMPLE.replace("\"draft\"", "\"approved\"")).unwrap();
    assert!(approve_patch(&approved, "k").is_none());
    let none = parse_entry("b.md", &SAMPLE.replace("approval_status: \"draft\"\n", "")).unwrap();
    assert_eq!(none.status, Status::Missing);
    assert!(approve_patch(&none, "k").is_none());
}

/// Every draft of the real music pack, joined in one patch, applies cleanly to the tree (checked, not applied).
#[test]
fn music_pack_patch_applies_with_git() {
    let root = repo_root();
    let entries = read_pack(&root.join("packs/music-college")).unwrap();
    assert!(entries.len() >= 14);
    let patch: String = entries.iter().filter_map(|e| approve_patch(e, "packs/music-college/knowledge")).collect();
    assert!(!patch.is_empty(), "the music pack still has drafts");
    let file = std::env::temp_dir().join(format!("pack_review_{}.patch", std::process::id()));
    std::fs::write(&file, &patch).unwrap();
    let out = Command::new("git").current_dir(&root).args(["apply", "--check"]).arg(&file).output().unwrap();
    let _ = std::fs::remove_file(&file);
    assert!(out.status.success(), "git apply --check: {}", String::from_utf8_lossy(&out.stderr));
}

#[test]
fn args_parse() {
    use pack_tools::run::parse;
    let a = parse(["p/".to_string(), "o.html".to_string()]).unwrap();
    assert_eq!(a.prefix, "p/knowledge");
    assert!(parse(["p".to_string()]).is_err());
    assert_eq!(parse(["--help".to_string()]), Err(String::new()));
    assert!(parse(["p".to_string(), "o".to_string(), "--bogus".to_string()]).is_err());
}
