use serde::{Deserialize, Serialize};

/// Why a 👎: a fixed set, so no free text (no personal data, no spam) is stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    Wrong,
    OffTopic,
    Outdated,
    Incomplete,
}

/// Reason counts of one entry.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReasonCounts {
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub off_topic: u32,
    #[serde(default)]
    pub outdated: u32,
    #[serde(default)]
    pub incomplete: u32,
}

/// One entry's stored feedback, as the worker reads it from D1.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct EntryFeedback {
    pub id: String,
    #[serde(default)]
    pub up: u32,
    #[serde(default)]
    pub down: u32,
    #[serde(default)]
    pub reasons: ReasonCounts,
    /// Unix ms of the last approved fix of this entry, if any.
    #[serde(default)]
    pub last_fix_at: Option<i64>,
}

/// One row of the entries-to-fix queue.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QueueRow {
    pub id: String,
    pub up: u32,
    pub down: u32,
    pub reasons: ReasonCounts,
    pub reason_total: u32,
    /// The most frequent reason (ties: the order of `Reason`), none when no reason was given.
    pub top_reason: Option<Reason>,
    pub last_fix_at: Option<i64>,
}

/// Votes of one entry on one UTC day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct DayVotes {
    pub day: i64,
    #[serde(default)]
    pub up: u32,
    #[serde(default)]
    pub down: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct Side {
    pub up: u32,
    pub down: u32,
    pub votes: u32,
    /// 👎 share of the votes; none with no votes
    pub down_share: Option<f64>,
}

/// Is a before/after difference worth reading yet?
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectVerdict {
    /// fewer than the minimum votes on either side: say nothing
    TooFewVotes,
    Lower,
    NotLower,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct FixEffect {
    pub fixed_day: i64,
    pub before: Side,
    pub after: Side,
    pub min_votes: u32,
    pub verdict: EffectVerdict,
}
