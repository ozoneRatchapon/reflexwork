use crate::types::{DayVotes, EffectVerdict, FixEffect, Side};

/// Below this many votes on either side, the dashboard says "too few votes" instead of a number that only looks like a result.
pub const MIN_VOTES: u32 = 10;

fn side<'a>(days: impl Iterator<Item = &'a DayVotes>) -> Side {
    let (up, down) = days.fold((0u32, 0u32), |(u, d), v| (u + v.up, d + v.down));
    let votes = up + down;
    Side { up, down, votes, down_share: (votes > 0).then(|| f64::from(down) / f64::from(votes)) }
}

/// 👎 share before vs after a fix. Votes are kept per UTC day, so the fix day itself mixes both sides: it is left out of both.
pub fn fix_effect(days: &[DayVotes], fixed_day: i64) -> FixEffect {
    let before = side(days.iter().filter(|d| d.day < fixed_day));
    let after = side(days.iter().filter(|d| d.day > fixed_day));
    let verdict = match (before.votes >= MIN_VOTES && after.votes >= MIN_VOTES, before.down_share, after.down_share) {
        (true, Some(b), Some(a)) if a < b => EffectVerdict::Lower,
        (true, _, _) => EffectVerdict::NotLower,
        (false, _, _) => EffectVerdict::TooFewVotes,
    };
    FixEffect { fixed_day, before, after, min_votes: MIN_VOTES, verdict }
}

/// Unix ms -> UTC day number (the key of the per-day vote table).
pub fn day_of(unix_ms: i64) -> i64 {
    unix_ms.div_euclid(86_400_000)
}
