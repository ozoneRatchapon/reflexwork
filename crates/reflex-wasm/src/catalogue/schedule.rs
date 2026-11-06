use super::types::Schedule;

const SEP: &str = " | ";

/// `_pEsc`: the five HTML-significant characters.
fn esc(s: &str) -> String {
    s.chars().fold(String::with_capacity(s.len()), |mut o, c| {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            _ => o.push(c),
        }
        o
    })
}

/// ECMAScript `\s` for the one regex that needs it (`/^หมายเหตุ\s*:?$/`).
fn is_js_space(c: char) -> bool {
    matches!(c, '\t'..='\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn is_note_label(l: &str) -> bool {
    l.strip_prefix("หมายเหตุ").is_some_and(|r| {
        let r = r.trim_start_matches(is_js_space);
        r.is_empty() || r == ":"
    })
}

/// `/^รอบ \d+$/` (ASCII digits, like JS `\d`).
fn is_numbered_round(c: &str) -> bool {
    c.strip_prefix("รอบ ").is_some_and(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
}

fn as_list(lines: &[&str]) -> Schedule {
    let list = lines
        .iter()
        .map(|l| match l.split(SEP).collect::<Vec<_>>().as_slice() {
            [head, rest @ ..] if !rest.is_empty() => format!("• {}: {}", esc(head), rest.iter().map(|x| esc(x)).collect::<Vec<_>>().join(" · ")),
            _ => format!("• {}", esc(l)),
        })
        .collect();
    Schedule { list, ..Schedule::default() }
}

/// Port of `_pSchedule(lines)` (data part).
pub fn schedule_table(lines: &[String]) -> Schedule {
    let lines: Vec<&str> = lines.iter().map(String::as_str).filter(|l| !l.starts_with("รายละเอียดกิจกรรม")).collect();
    let Some(hi) = lines.iter().position(|l| l.starts_with("รอบการรับสมัคร") && l.contains(SEP)) else {
        return as_list(&lines);
    };
    let cols: Vec<String> = lines[hi].split(SEP).skip(1).map(str::to_owned).collect();
    let (mut rows, mut notes) = (Vec::new(), Vec::new());
    for l in &lines[hi + 1..] {
        if !l.contains(SEP) {
            // QA F62: '(เปิดรับสมัคร …)' under the header is the opening date of the last, named round (twin of chatbot.html)
            let last = cols.last().map(String::as_str).unwrap_or("");
            if l.starts_with("(เปิดรับสมัคร") && l.ends_with(')') && !last.is_empty() && !is_numbered_round(last) {
                notes.push(format!("{last}: {}", &l[1..l.len() - 1]));
                continue;
            }
            if !is_note_label(l) {
                notes.push(l.trim_start_matches('*').trim_start_matches(is_js_space).to_owned());
            }
            continue;
        }
        let cells: Vec<&str> = l.split(SEP).collect();
        if cells.len() != cols.len() + 1 {
            return as_list(&lines);
        }
        let dates = cells[1..].iter().zip(&cols).map(|(x, col)| x.strip_prefix(&format!("{col} ")).unwrap_or(x).to_owned());
        rows.push(std::iter::once(cells[0].to_owned()).chain(dates).collect());
    }
    if rows.is_empty() {
        return as_list(&lines);
    }
    Schedule { cols, rows, notes, list: Vec::new() }
}
