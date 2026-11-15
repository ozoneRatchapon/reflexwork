//! The College's English schedule page and the Thai entries must read to the same dates (plan 019 item 4.3).

use pack_tools::dates::parse_ymd;
use pack_tools::facts::{dates_in, html_text, paren_names};

fn days(list: &[&str]) -> Vec<i64> {
    list.iter().map(|s| parse_ymd(s).unwrap()).collect()
}

#[test]
fn english_page_dates() {
    let t = "Available From August 25, 2026. Deadline Sat. 19 Sep. 2026 Report 31 Oct. – 6 Nov. 2026 pay 19-25 Dec. 2026 Sept 3 2027 May 2026";
    assert_eq!(dates_in(t).into_iter().collect::<Vec<_>>(), days(&["2026-08-25", "2026-09-19", "2026-11-06", "2026-12-19", "2026-12-25", "2027-09-03"]));
}

#[test]
fn same_facts_in_thai_and_english() {
    let th = "- ปิดรับใบสมัคร: 19 ก.ย. 2569\n- รายงานตัว: 31 ต.ค. – 6 พ.ย. 2569";
    let en = "Application Submission Deadline Sat. 19 Sep. 2026 Report, register and pay tuition fees 31 Oct. – 6 Nov. 2026";
    assert_eq!(dates_in(th), dates_in(en));
}

#[test]
fn html_text_drops_code_and_decodes_entities() {
    let h = "<p>Jazz&nbsp;&amp; Pop</p><script>var x='19 Sep. 2026'</script><style>p{}</style><!-- 1 Jan. 2027 --><b>&#8211;&#x41;</b>";
    assert_eq!(html_text(h), "Jazz & Pop –A");
}

#[test]
fn english_names_in_parentheses() {
    let t = "แจ๊ส (Jazz), ธุรกิจดนตรี (Music Business), MEI (ปริญญาตรีดนตรี), (2026), (https://x), เอก (Ph.D.), (Thai & Eastern Music)";
    assert_eq!(paren_names(t), ["Jazz", "Music Business", "Thai & Eastern Music"]);
}

#[test]
fn a_spaced_day_range_gives_both_ends() {
    // "10 – 14 เม.ย. 2571" (spaced dash) reads like "10–14 April 2028"; a day before another month ("31 ต.ค. – 6 พ.ย.") is still skipped
    assert_eq!(dates_in("หยุดสงกรานต์: 10 – 14 เม.ย. 2571"), dates_in("10–14 April 2028"));
    assert_eq!(dates_in("10 – 14 เม.ย. 2571").into_iter().collect::<Vec<_>>(), days(&["2028-04-10", "2028-04-14"]));
    assert_eq!(dates_in("31 ต.ค. – 6 พ.ย. 2569").into_iter().collect::<Vec<_>>(), days(&["2026-11-06"]));
}
