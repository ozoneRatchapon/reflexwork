use super::types::{FeeRow, FeeTable};

/// `l.split(/ ?\| ?/)`: split at "|", dropping at most one space on each side of it.
fn cells(l: &str) -> Vec<&str> {
    let parts: Vec<&str> = l.split('|').collect();
    let last = parts.len() - 1;
    parts
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let p = if i > 0 { p.strip_prefix(' ').unwrap_or(p) } else { p };
            if i < last {
                p.strip_suffix(' ').unwrap_or(p)
            } else {
                p
            }
        })
        .collect()
}

/// `/^(?:[\d,.]+|-)$/`
fn is_amount(x: &str) -> bool {
    x == "-" || (!x.is_empty() && x.bytes().all(|b| b.is_ascii_digit() || b == b',' || b == b'.'))
}

/// `/^\[\d+\]/`
fn is_note(l: &str) -> bool {
    l.strip_prefix('[').is_some_and(|r| {
        let d = r.bytes().take_while(u8::is_ascii_digit).count();
        d > 0 && r.as_bytes().get(d) == Some(&b']')
    })
}

/// Port of `_pFee(lines)`: rows only when both table headers are present (the page shows no table otherwise).
pub fn fee_table(lines: &[String]) -> FeeTable {
    let has_h1 = lines.iter().any(|l| l.starts_with("แผนการศึกษา | ระยะเวลา"));
    // `/^ค่าวิจัย.*\| ค่าธรรมเนียมการศึกษาดูงาน$/` (`.` stops at line terminators)
    let has_h2 = lines.iter().any(|l| {
        l.starts_with("ค่าวิจัย")
            && l.ends_with("| ค่าธรรมเนียมการศึกษาดูงาน")
            && !l.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
    });
    let (mut rows, mut grp) = (Vec::new(), String::new());
    for l in lines {
        if l == "นักศึกษาไทย" || l == "นักศึกษาต่างชาติ" {
            grp = l.clone();
            continue;
        }
        if !(has_h1 && has_h2) {
            continue;
        }
        let row = |plan: &str, dur: &str, lump: &str, res: &str, visit: &str| FeeRow {
            grp: grp.clone(),
            plan: plan.to_owned(),
            dur: dur.to_owned(),
            lump: lump.to_owned(),
            res: res.to_owned(),
            visit: visit.to_owned(),
        };
        match cells(l).as_slice() {
            [plan, dur, lump, res, visit] if !plan.is_empty() && is_amount(lump) && is_amount(res) && !visit.is_empty() => rows.push(row(plan, dur, lump, res, visit)),
            [dur, lump, res, visit] if is_amount(lump) && is_amount(res) && !visit.is_empty() => rows.push(row("", dur, lump, res, visit)),
            _ => {}
        }
    }
    FeeTable { rows, notes: lines.iter().filter(|l| is_note(l)).cloned().collect() }
}
