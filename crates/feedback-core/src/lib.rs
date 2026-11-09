//! Feedback rules for the kernel worker, compiled to wasm (`build.sh` -> `integrations/kernel-worker/fbcore/`).
//! The worker only reads and writes D1; every decision about reasons, the queue and a fix's effect is here.
pub mod effect;
pub mod queue;
pub mod reason;
pub mod types;

use wasm_bindgen::prelude::*;

use types::{DayVotes, EntryFeedback, Reason};

/// The reason code if `s` is exactly one of `wrong | off_topic | outdated | incomplete`, else `undefined`.
#[wasm_bindgen]
pub fn parse_reason(s: &str) -> Option<String> {
    Reason::parse(s).map(|r| r.code().to_string())
}

/// `rows`: JSON `[{id, up, down, reasons: {wrong, off_topic, outdated, incomplete}, last_fix_at}]` -> the queue as JSON.
#[wasm_bindgen]
pub fn fix_queue(rows: &str) -> Result<String, JsError> {
    let rows: Vec<EntryFeedback> = serde_json::from_str(rows)?;
    Ok(serde_json::to_string(&queue::fix_queue(&rows))?)
}

/// `days`: JSON `[{day, up, down}]` of one entry; `fixed_at`: Unix ms of the fix -> before / after as JSON.
#[wasm_bindgen]
pub fn fix_effect(days: &str, fixed_at: f64) -> Result<String, JsError> {
    let days: Vec<DayVotes> = serde_json::from_str(days)?;
    Ok(serde_json::to_string(&effect::fix_effect(&days, effect::day_of(fixed_at as i64)))?)
}

/// Unix ms -> UTC day number.
#[wasm_bindgen]
pub fn day_of(unix_ms: f64) -> f64 {
    effect::day_of(unix_ms as i64) as f64
}
