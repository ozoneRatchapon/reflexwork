//! Plan 019 item 4.4: pack lint finds competing titles but not intended series, empty keyword lines, and answer dates after valid_to.

use pack_tools::dates::parse_ymd;
use pack_tools::entry::parse_entry;
use pack_tools::facts::dates_in;
use pack_tools::lint::{lint, similarity, Finding};
use pack_tools::types::Entry;

fn entry(name: &str, title: &str, extra_fm: &str, body: &str) -> Entry {
    let text = format!("---\ntitle: \"{title}\"\nsource_url: \"https://x.test/\"\napproval_status: \"draft\"\n{extra_fm}---\n{body}\n");
    parse_entry(name, &text).unwrap()
}

fn findings<'a>(all: &'a [(String, Vec<Finding>)], file: &str) -> &'a [Finding] {
    all.iter().find(|(f, _)| f == file).map_or(&[], |(_, v)| v.as_slice())
}

#[test]
fn reads_thai_dates_in_both_eras_ranges_and_skips_impossible_ones() {
    let d: Vec<i64> = dates_in("รายงานตัว 31 ต.ค. – 6 พ.ย. 2569 และ 31 ก.พ. 2570, สอบ 10 ตุลาคม 2026, ชำระ 19–25 ธ.ค. 2569").into_iter().collect();
    let want: Vec<i64> = ["2026-10-10", "2026-11-06", "2026-12-19", "2026-12-25"].iter().map(|s| parse_ymd(s).unwrap()).collect();
    assert_eq!(d, want);
}

#[test]
fn competing_titles_are_flagged_but_series_are_not() {
    let es = [
        entry("a.md", "บุคคลทั่วไปแก้ไขที่อยู่ในหนังสือรับรอง MAP-C ทำอย่างไร", "", "x"),
        entry("b.md", "บุคคลทั่วไปที่เรียน MAP-C แก้ไขที่อยู่บนหนังสือรับรองทำอย่างไร", "", "x"),
        entry("r1.md", "รับสมัครรอบ 1 ปีการศึกษา 2570 ปิดรับเมื่อไร", "", "x"),
        entry("r2.md", "รับสมัครรอบ 2 ปีการศึกษา 2570 ปิดรับเมื่อไร", "", "x"),
        entry("t1.md", "กำหนดการลงทะเบียน ภาคต้น ปีการศึกษา 2570", "", "x"),
        entry("t2.md", "กำหนดการลงทะเบียน ภาคปลาย ปีการศึกษา 2570", "", "x"),
        entry("d1.md", "ติดต่อใคร", "", "x"),
        entry("d2.md", "ติดต่อ ใคร?", "", "x"),
    ];
    let all = lint(&es);
    assert!(matches!(findings(&all, "a.md"), [Finding::SimilarTitle { other, .. }] if other == "b.md"));
    for series in ["r1.md", "r2.md", "t1.md", "t2.md"] {
        assert!(findings(&all, series).is_empty(), "{series} is part of a series");
    }
    assert!(matches!(findings(&all, "d1.md"), [Finding::DuplicateTitle { other }] if other == "d2.md"), "spacing and punctuation do not hide a duplicate");
    assert!(similarity("abc", "abc") > 0.99 && similarity("abc", "xyz") < 0.01);
}

#[test]
fn per_entry_checks() {
    let es = [
        entry("kw.md", "หนึ่ง", "", "## หนึ่ง\n\nคำค้นภาษาอังกฤษ:\n\nคำตอบ"),
        entry("late.md", "สอง", "valid_to: \"2026-10-31\"\n", "รายงานตัว 31 ต.ค. – 6 พ.ย. 2569"),
        entry("ok.md", "สาม", "valid_to: \"2026-11-06\"\n", "รายงานตัว 31 ต.ค. – 6 พ.ย. 2569"),
        entry("empty.md", "สี่", "", ""),
        entry("two.md", "ห้า", "", "## ห้า\n\nคำค้นภาษาไทย: ก\nคำค้นภาษาอังกฤษ: b\n\nคำตอบ"),
    ];
    let all = lint(&es);
    assert!(matches!(findings(&all, "kw.md"), [Finding::EmptyKeywordLine { line: 8 }]), "{:?}", findings(&all, "kw.md"));
    assert!(matches!(findings(&all, "late.md"), [Finding::DateAfterValidTo { date, .. }] if date == "2026-11-06"));
    assert!(findings(&all, "ok.md").is_empty());
    assert!(matches!(findings(&all, "empty.md"), [Finding::EmptyBody]));
    assert!(matches!(findings(&all, "two.md"), [Finding::ExtraKeywordLine { line: 9, first: 8 }]), "{:?}", findings(&all, "two.md"));
}

/// The music pack is clean today; a new warning there means an entry was added that competes or contradicts its valid_to.
#[test]
fn music_pack_is_clean() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/music-college");
    let all = lint(&pack_tools::entry::read_pack(&root).unwrap());
    assert!(all.is_empty(), "{all:?}");
}

#[test]
fn paragraphs_the_chat_never_shows() {
    // the frontmatter of `entry` is 5 lines, so the body starts on line 6
    let es = [
        entry("one.md", "หนึ่ง", "", "## หนึ่ง\n\nคำค้น: ก\n\nย่อหน้าแรก\n\nย่อหน้าสอง\n- ข้อ\n\nย่อหน้าสาม"),
        entry("joined.md", "สอง", "", "## สอง\n\nคำค้น: ก\n\nย่อหน้าแรก\n- ข้อ\nย่อหน้าต่อ"),
        entry("sections.md", "สาม", "", "## สาม\nส่วนแรก\n\n## ส่วนสอง\nข้อความ\n\nต่อ"),
        entry("cited.md", "สี่", "", "## สี่\nคำตอบ\n\n## แหล่งอ้างอิง\n\nhttps://x.test/"),
        entry("titled.md", "ห้า", "", "# เอกสาร\n\nคำนำ\n\n## ห้า\nคำตอบ\n\nอีกย่อหน้า"),
    ];
    let all = lint(&es);
    assert!(matches!(findings(&all, "one.md"), [Finding::UnservedParagraphs { line: 12, count: 2 }]), "{:?}", findings(&all, "one.md"));
    assert!(findings(&all, "joined.md").is_empty(), "one paragraph with single line breaks is served whole");
    assert!(findings(&all, "sections.md").is_empty(), "two ## sections are all served");
    assert!(findings(&all, "cited.md").is_empty(), "a citation section is skipped on purpose");
    // the builder serves the section's first paragraph: the preamble after `# title` and the second paragraph are lost
    assert!(matches!(findings(&all, "titled.md"), [Finding::UnservedParagraphs { line: 8, count: 2 }]), "{:?}", findings(&all, "titled.md"));
}

/// The builder's cap: a multi-section answer stops at `ANSWER_CAP` characters, on a section boundary (the registration schedules).
#[test]
fn sections_past_the_answer_cap() {
    let long = "ก".repeat(900);
    let es = [
        entry("cut.md", "หก", "", &format!("## หก\n{long}\n\n## สอง\n{long}\n\n## สาม\nสั้น")),
        entry("fits.md", "เจ็ด", "", &format!("## เจ็ด\n{long}\n\n## สอง\nสั้น")),
        // no preamble: the first block is always served, however long
        entry("first.md", "แปด", "", &format!("## แปด\n{long}{long}\n\n## สอง\nสั้น")),
    ];
    let all = lint(&es);
    // body line 6 `## หก`, 7 text, 8 blank, 9 `## สอง`, 10 text: sections two and three are cut
    assert!(matches!(findings(&all, "cut.md"), [Finding::CappedSections { line: 10, count: 2 }]), "{:?}", findings(&all, "cut.md"));
    assert!(findings(&all, "fits.md").is_empty(), "{:?}", findings(&all, "fits.md"));
    assert!(matches!(findings(&all, "first.md"), [Finding::CappedSections { line: 10, count: 1 }]), "{:?}", findings(&all, "first.md"));
}
