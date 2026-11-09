use crate::types::{EntryFeedback, QueueRow};

/// Entries to fix: only entries with a 👎 or a reason, most 👎 first, then most reasons, then id (stable for the dashboard).
pub fn fix_queue(rows: &[EntryFeedback]) -> Vec<QueueRow> {
    let mut out: Vec<QueueRow> = rows
        .iter()
        .filter(|r| r.down > 0 || r.reasons.total() > 0)
        .map(|r| QueueRow {
            id: r.id.clone(),
            up: r.up,
            down: r.down,
            reasons: r.reasons,
            reason_total: r.reasons.total(),
            top_reason: r.reasons.top(),
            last_fix_at: r.last_fix_at,
        })
        .collect();
    out.sort_by(|a, b| b.down.cmp(&a.down).then(b.reason_total.cmp(&a.reason_total)).then(a.id.cmp(&b.id)));
    out
}
