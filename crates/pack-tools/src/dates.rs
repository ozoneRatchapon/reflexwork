//! Calendar dates as `YYYY-MM-DD` day numbers, without a date crate (std has none).

use std::time::{SystemTime, UNIX_EPOCH};

use crate::types::Validity;

/// Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's `days_from_civil`).
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = i64::from((m + 9) % 12);
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `YYYY-MM-DD` for a day number (inverse of [`days_from_civil`]).
pub fn civil_from_days(z: i64) -> String {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Day number of a strict `YYYY-MM-DD`; `None` for anything else (including impossible dates such as 2026-02-30).
pub fn parse_ymd(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let m: u32 = s[5..7].parse().ok()?;
    let d: u32 = s[8..10].parse().ok()?;
    if !(1..=12).contains(&m) || d == 0 {
        return None;
    }
    let n = days_from_civil(y, m, d);
    (civil_from_days(n) == s).then_some(n)
}

/// Today (UTC) as a day number.
pub fn today() -> i64 {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    i64::try_from(secs / 86_400).unwrap_or(0)
}

/// Compare `valid_to` with `today`; `soon_days` is the warning window (7 in plan 019 item 4.2).
pub fn validity(valid_to: Option<&str>, today: i64, soon_days: i64) -> Validity {
    let Some(end) = valid_to.and_then(parse_ymd) else { return Validity::Unknown };
    match end - today {
        left if left < 0 => Validity::Expired,
        left if left < soon_days => Validity::EndingSoon,
        _ => Validity::Current,
    }
}
