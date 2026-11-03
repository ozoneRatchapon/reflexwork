//! `answerPoints(body)`: the manual's own words cut into short points (chatbot.html `answerPoints` / `_sentences`).
use super::js_text::{from_u16, is_digit, is_js_space, skip_space, starts_at, to_u16, trim};

/// `_SPLIT_BEFORE`: a whitespace run followed by one of these words starts a new point.
const SPLIT_WORDS: [&str; 13] = [
    "หาก", "ถ้า", "จากนั้น", "ทั้งนี้", "กรณี", "หลังจาก", "นอกจากนี้", "อย่างไรก็ตาม", "ส่วน", "ขั้นตอนหลัก", "ข้อควรจำ", "ระหว่างนี้", "FAQ",
];
const DOT: u16 = b'.' as u16;
const IDEO_DOT: u16 = 0x3002; // 。

fn not_space_or_dot(c: u16) -> bool {
    !is_js_space(c) && c != DOT
}

/// `/[.][^\s.]{1,3}$/` on the 4 units before a full stop: an abbreviation such as พ.ศ. or e.g.
fn ends_with_abbrev(b: &[u16]) -> bool {
    (1..=3).any(|k| b.len() > k && b[b.len() - k - 1] == DOT && b[b.len() - k..].iter().all(|&c| not_space_or_dot(c)))
}

/// `/(?:^|\s)[^\s.]{1,2}$/` on the same 4 units: a one- or two-letter word before the stop (ม. in ม.มหิดล).
fn ends_with_short_word(b: &[u16]) -> bool {
    (1..=2).any(|k| {
        b.len() >= k
            && b[b.len() - k..].iter().all(|&c| not_space_or_dot(c))
            && (b.len() == k || is_js_space(b[b.len() - k - 1]))
    })
}

/// `_sentences(line)`: split at ". " / "。 " unless the stop belongs to an abbreviation or a number follows.
fn sentences(u: &[u16]) -> Vec<&[u16]> {
    let (mut out, mut from, mut i) = (Vec::new(), 0, 0);
    while i < u.len() {
        let is_stop = (u[i] == DOT || u[i] == IDEO_DOT) && i + 1 < u.len() && is_js_space(u[i + 1]);
        if !is_stop {
            i += 1;
            continue;
        }
        let j = skip_space(u, i + 1);
        let before = &u[i.saturating_sub(4)..i];
        let keep_together = u.get(j).is_some_and(|&c| is_digit(c)) || ends_with_abbrev(before) || ends_with_short_word(before);
        if !keep_together {
            out.push(&u[from..=i]);
            from = j;
        }
        i = j; // the regex resumes after the match either way
    }
    out.push(&u[from..]);
    out
}

/// `x.split(_SPLIT_BEFORE)`: cut at whitespace runs that are followed by a SPLIT_WORDS entry (the run is dropped).
fn split_before<'a>(u: &'a [u16], words: &[Vec<u16>]) -> Vec<&'a [u16]> {
    let (mut out, mut last, mut i) = (Vec::new(), 0, 0);
    while i < u.len() {
        if !is_js_space(u[i]) {
            i += 1;
            continue;
        }
        let j = skip_space(u, i);
        if words.iter().any(|w| starts_at(u, j, w)) {
            out.push(&u[last..i]);
            last = j;
        }
        i = j;
    }
    out.push(&u[last..]);
    out
}

/// `/^(?:[-•*]|\d+[.)])\s+/` removed from a trimmed line.
fn strip_list_marker(u: &[u16]) -> &[u16] {
    let marker_end = match u.first() {
        Some(&c) if c == b'-' as u16 || c == 0x2022 || c == b'*' as u16 => 1,
        Some(&c) if is_digit(c) => {
            let d = u.iter().position(|&c| !is_digit(c)).unwrap_or(u.len());
            match u.get(d) {
                Some(&c) if c == DOT || c == b')' as u16 => d + 1,
                _ => return u,
            }
        }
        _ => return u,
    };
    match skip_space(u, marker_end) {
        end if end > marker_end => &u[end..],
        _ => u,
    }
}

/// Port of `answerPoints(body)`.
pub fn answer_points(body: &str) -> Vec<String> {
    let words: Vec<Vec<u16>> = SPLIT_WORDS.iter().map(|w| to_u16(w)).collect();
    let u = to_u16(body);
    u.split(|&c| c == b'\n' as u16)
        .map(|line| strip_list_marker(trim(line)))
        .flat_map(sentences)
        .flat_map(|s| split_before(s, &words))
        .filter_map(|p| {
            let t = trim(p);
            let t = t.strip_suffix(&[DOT]).unwrap_or(t);
            (!t.is_empty()).then(|| from_u16(t))
        })
        .collect()
}
