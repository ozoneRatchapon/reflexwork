//! `slotLead(entry, question)`: the specific number asked for, pulled out of the answer (chatbot.html `_SLOTS`).
//! Each grab regex is ported as a leftmost-first matcher; the patterns have no ambiguous backtracking beyond the
//! optional prefix alternatives, which are tried in the regex's order and then skipped.
use super::js_text::{from_u16, is_digit, is_js_space, skip_space, starts_at, to_u16, trim};

#[derive(Clone, Copy)]
enum Slot {
    Duration,
    Money,
    Percent,
}

const ASKS: [(Slot, &[&str]); 3] = [
    (Slot::Duration, &["กี่วัน", "ภายในกี่", "นานแค่ไหน", "นานเท่าไร", "นานเท่าไหร่", "นานไหม", "ใช้เวลา", "กี่สัปดาห์", "กี่เดือน", "ระยะเวลา"]),
    (Slot::Money, &["เท่าไร", "เท่าไหร่", "กี่บาท", "ค่าใช้จ่าย", "ราคา", "ค่าธรรมเนียม", "ค่าสอบ", "ค่าตอบแทน"]),
    (Slot::Percent, &["กี่%", "กี่ %", "กี่เปอร์", "เกินเท่าไร", "เกินกี่", "ไม่เกินเท่าไร"]),
];

/// Money `not`: a deadline or duration question that only names a fee asks for a date, not the fine (QA F17)...
const MONEY_NOT: [&str; 6] = ["นานเท่าไ", "วันสุดท้าย", "วันไหน", "เมื่อไร", "เมื่อไหร่", "กี่วัน"];
/// ...`unless` it asks for an amount outright (`กี่บาท|ราคา|ค่า\S*เท่าไ`).
fn money_asked_outright(q: &str) -> bool {
    if q.contains("กี่บาท") || q.contains("ราคา") {
        return true;
    }
    q.match_indices("ค่า").any(|(i, m)| {
        let rest = &q[i + m.len()..];
        rest.find("เท่าไ").is_some_and(|j| !rest[..j].chars().any(|c| c.is_whitespace()))
    })
}

fn digits_end(u: &[u16], at: usize) -> Option<usize> {
    let end = at + u[at..].iter().take_while(|&&c| is_digit(c)).count();
    (end > at).then_some(end)
}

/// `\s*\d+\s*` then a unit; returns the end of the match.
fn number_then(u: &[u16], at: usize, unit: impl Fn(&[u16], usize) -> Option<usize>) -> Option<usize> {
    let d = digits_end(u, skip_space(u, at))?;
    unit(u, skip_space(u, d))
}

/// `\s*(?<!\d)\d{1,3}\s*` then a duration unit: a number standing alone, at most 3 digits ("2569 วันสุดท้าย" is a year, QA F17).
fn short_number_then(u: &[u16], at: usize, unit: impl Fn(&[u16], usize) -> Option<usize>) -> Option<usize> {
    let d0 = skip_space(u, at);
    if d0 > 0 && is_digit(u[d0 - 1]) {
        return None;
    }
    let d = digits_end(u, d0)?;
    if d - d0 > 3 {
        return None;
    }
    unit(u, skip_space(u, d))
}

fn duration_unit(u: &[u16], at: usize) -> Option<usize> {
    let w = |s: &str| to_u16(s);
    if starts_at(u, at, &w("วัน")) {
        let after = at + 3;
        return Some(if starts_at(u, after, &w("ทำการ")) { after + 5 } else { after });
    }
    ["สัปดาห์", "เดือน"].iter().map(|s| w(s)).find(|s| starts_at(u, at, s)).map(|s| at + s.len())
}

/// Optional prefix alternatives in regex order; `None` entry = the empty alternative.
fn prefixed(u: &[u16], at: usize, prefixes: &[&str], rest: &dyn Fn(&[u16], usize) -> Option<usize>) -> Option<usize> {
    for p in prefixes {
        let mut after = match *p {
            "ราว" => {
                if !starts_at(u, at, &to_u16("ราว")) {
                    continue;
                }
                at + 3
            }
            _ => {
                let pw = to_u16(p);
                if !starts_at(u, at, &pw) {
                    continue;
                }
                at + pw.len()
            }
        };
        if *p == "ราว" {
            // `ราว ?ๆ?`
            if u.get(after) == Some(&(b' ' as u16)) {
                after += 1;
            }
            if u.get(after) == Some(&0x0E46) {
                after += 1;
            }
        }
        if let Some(end) = rest(u, after) {
            return Some(end);
        }
    }
    rest(u, at)
}

fn grab_at(slot: Slot, u: &[u16], at: usize) -> Option<usize> {
    match slot {
        Slot::Duration => prefixed(u, at, &["ไม่เกิน", "ภายใน", "ประมาณ", "ราว"], &|u, a| short_number_then(u, a, duration_unit)),
        Slot::Money => {
            // `\d[\d,]*\s*บาท`
            if !u.get(at).is_some_and(|&c| is_digit(c)) {
                return None;
            }
            let end = at + 1 + u[at + 1..].iter().take_while(|&&c| is_digit(c) || c == b',' as u16).count();
            let b = skip_space(u, end);
            let baht = to_u16("บาท");
            starts_at(u, b, &baht).then(|| b + baht.len())
        }
        Slot::Percent => prefixed(u, at, &["ไม่เกิน", "เกิน"], &|u, a| {
            number_then(u, a, |u, x| (u.get(x) == Some(&(b'%' as u16))).then_some(x + 1))
        }),
    }
}

/// `m[0].trim().replace(/\s+/g,' ')`
fn normalise(m: &[u16]) -> String {
    let mut out: Vec<u16> = Vec::with_capacity(m.len());
    for &c in trim(m) {
        match (is_js_space(c), out.last()) {
            (true, Some(&l)) if l == b' ' as u16 => {}
            (true, _) => out.push(b' ' as u16),
            (false, _) => out.push(c),
        }
    }
    from_u16(&out)
}

/// Every non-overlapping match of the slot's grab, left to right (`body.match(/…/g)`).
fn all_matches(slot: Slot, u: &[u16]) -> Vec<String> {
    let (mut out, mut at) = (Vec::new(), 0);
    while at < u.len() {
        match grab_at(slot, u, at) {
            Some(end) if end > at => {
                out.push(normalise(&u[at..end]));
                at = end;
            }
            _ => at += 1,
        }
    }
    out
}

/// The duration lead: a bare number gets "ภายใน "; a written-out prefix keeps a space before its number ("ภายใน3" -> "ภายใน 3").
fn duration_lead(m: &str) -> String {
    if m.starts_with(|c: char| c.is_ascii_digit()) {
        return format!("ภายใน {m}");
    }
    for p in ["ไม่เกิน", "ภายใน", "ประมาณ"] {
        if let Some(rest) = m.strip_prefix(p) {
            if rest.starts_with(|c: char| c.is_ascii_digit()) {
                return format!("{p} {rest}");
            }
        }
    }
    m.to_owned()
}

/// Port of `slotLead(entry, question)`.
pub fn slot_lead(answer: &str, question: &str) -> String {
    let u = to_u16(answer);
    for (slot, asks) in ASKS {
        if !asks.iter().any(|a| question.contains(a)) {
            continue;
        }
        if matches!(slot, Slot::Money) && MONEY_NOT.iter().any(|w| question.contains(w)) && !money_asked_outright(question) {
            continue;
        }
        let all = all_matches(slot, &u);
        let Some(first) = all.first() else { continue };
        // several different amounts (GRID: three tiers): one bold figure would mislead, so no money lead
        if matches!(slot, Slot::Money) {
            let key = |x: &String| x.chars().filter(|c| !c.is_whitespace() && *c != ',').collect::<String>();
            if all.iter().any(|x| key(x) != key(first)) {
                continue;
            }
        }
        return match slot {
            Slot::Duration => duration_lead(first),
            _ => first.clone(),
        };
    }
    String::new()
}
