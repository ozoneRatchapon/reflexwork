//! Facts an entry states and a web page shows, in a form both can be compared in: calendar dates (Thai or English, Buddhist or
//! common era) and the English names an entry puts in parentheses (majors, systems). Used by `pack-lint` and `pack-watch`.

use std::collections::BTreeSet;

use crate::dates::parse_ymd;

const THAI_MONTHS: [[&str; 2]; 12] = [
    ["ม.ค.", "มกราคม"],
    ["ก.พ.", "กุมภาพันธ์"],
    ["มี.ค.", "มีนาคม"],
    ["เม.ย.", "เมษายน"],
    ["พ.ค.", "พฤษภาคม"],
    ["มิ.ย.", "มิถุนายน"],
    ["ก.ค.", "กรกฎาคม"],
    ["ส.ค.", "สิงหาคม"],
    ["ก.ย.", "กันยายน"],
    ["ต.ค.", "ตุลาคม"],
    ["พ.ย.", "พฤศจิกายน"],
    ["ธ.ค.", "ธันวาคม"],
];

const EN_MONTHS: [&str; 12] =
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/// Month 1..=12 of a Thai or English month word ("พ.ย.", "พ.ย", "พฤศจิกายน", "Nov.", "Nov", "Sept.", "November").
fn month_of(word: &str) -> Option<u32> {
    if let Some(i) = THAI_MONTHS.iter().position(|n| n.contains(&word) || n[0].trim_end_matches('.') == word) {
        return u32::try_from(i + 1).ok();
    }
    let w = word.trim_end_matches('.').to_ascii_lowercase();
    let i = EN_MONTHS.iter().position(|m| w == *m || (w.len() >= 3 && m.starts_with(w.as_str()) && (w.len() == 3 || w == "sept")))?;
    u32::try_from(i + 1).ok()
}

/// A 4-digit year; 2400 and above is Buddhist Era.
fn year_of(word: &str) -> Option<i64> {
    let digits = word.trim_end_matches(|c: char| !c.is_ascii_digit());
    let y: i64 = (digits.len() == 4).then(|| digits.parse().ok()).flatten()?;
    Some(if y >= 2400 { y - 543 } else { y })
}

/// Day numbers of "D", or both ends of a range "D1-D2" / "D1–D2".
fn days_of(word: &str) -> Vec<u32> {
    word.split(['-', '–'])
        .map(|p| p.parse::<u32>().ok().filter(|d| (1..=31).contains(d)))
        .collect::<Option<Vec<u32>>>()
        .filter(|v| (1..=2).contains(&v.len()))
        .unwrap_or_default()
}

/// Every full date in `text`, as day numbers: "6 พ.ย. 2569", "19–25 ธ.ค. 2569", "Sat. 19 Sep. 2026", "August 25, 2026",
/// "19-25 Dec. 2026". A day with no year of its own ("31 ต.ค. – 6 พ.ย. 2569": the first) is skipped, not guessed.
pub fn dates_in(text: &str) -> BTreeSet<i64> {
    let words: Vec<&str> =
        text.split(|c: char| c.is_whitespace() || matches!(c, ',' | '(' | ')' | ':' | ';')).filter(|w| !w.is_empty()).collect();
    let mut out = BTreeSet::new();
    let mut push = |y: i64, m: u32, days: &[u32]| {
        for d in days {
            if let Some(n) = parse_ymd(&format!("{y:04}-{m:02}-{d:02}")) {
                out.insert(n);
            }
        }
    };
    // D1 – D2 Month Year: a range written with a spaced dash ("10 – 14 เม.ย. 2571"); both ends share the month and year
    for w in words.windows(5) {
        let dash = matches!(w[1], "-" | "–");
        if let (true, [d1], [d2], Some(m), Some(y)) = (dash, days_of(w[0]).as_slice(), days_of(w[2]).as_slice(), month_of(w[3]), year_of(w[4])) {
            push(y, m, &[*d1, *d2]);
        }
    }
    for w in words.windows(3) {
        // D Month Year
        if let (false, Some(m), Some(y)) = (days_of(w[0]).is_empty(), month_of(w[1]), year_of(w[2])) {
            push(y, m, &days_of(w[0]));
        }
        // Month D, Year
        if let (Some(m), false, Some(y)) = (month_of(w[0]), days_of(w[1]).is_empty(), year_of(w[2])) {
            push(y, m, &days_of(w[1]));
        }
    }
    out
}

/// English names an entry gives in parentheses after a Thai name: "แจ๊ส (Jazz)" → "Jazz". Only letters, spaces, `&` and `-`, at
/// least two letters; anything else in parentheses (numbers, URLs, Thai) is not a name.
pub fn paren_names(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('(') {
        let after = &rest[open + 1..];
        let Some(close) = after.find(')') else { break };
        let inner = after[..close].trim();
        let letters = inner.chars().filter(char::is_ascii_alphabetic).count();
        if letters >= 2 && inner.chars().all(|c| c.is_ascii_alphabetic() || matches!(c, ' ' | '&' | '-')) {
            out.push(inner.to_string());
        }
        rest = &after[close + 1..];
    }
    out
}

/// The visible text of an HTML page: no script/style/comments, tags as spaces, common entities decoded, whitespace collapsed.
pub fn html_text(html: &str) -> String {
    let mut text = String::with_capacity(html.len() / 2);
    let lower = html.to_ascii_lowercase();
    let mut i = 0;
    while i < html.len() {
        let Some(lt) = html[i..].find('<').map(|p| p + i) else {
            text.push_str(&html[i..]);
            break;
        };
        text.push_str(&html[i..lt]);
        text.push(' ');
        let skip_to = |end: &str| lower[lt..].find(end).map_or(html.len(), |p| lt + p + end.len());
        i = match () {
            _ if lower[lt..].starts_with("<!--") => skip_to("-->"),
            _ if lower[lt..].starts_with("<script") => skip_to("</script>"),
            _ if lower[lt..].starts_with("<style") => skip_to("</style>"),
            _ => html[lt..].find('>').map_or(html.len(), |p| lt + p + 1),
        };
    }
    let decoded = decode_entities(&text);
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp + 1..];
        let Some(semi) = after.find(';').filter(|&p| p <= 10) else {
            out.push('&');
            rest = after;
            continue;
        };
        let name = &after[..semi];
        let ch = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            "ndash" => Some('–'),
            "mdash" => Some('—'),
            _ => name
                .strip_prefix("#x")
                .or_else(|| name.strip_prefix("#X"))
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| name.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &after[semi + 1..];
            }
            None => {
                out.push('&');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}
