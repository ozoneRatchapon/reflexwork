//! Readers for the programme announcement sections (.plans/002 step 3): the admission schedule table and the fee table.
//! Ports of `_pSchedule()` / `_pFee()` in `submissions/ui/chatbot.html` (data only; the card HTML stays in JS).
//! Contract: `benchmark/golden/schedule_fee.json`.
mod fee;
mod schedule;
mod types;

pub use fee::fee_table;
pub use schedule::schedule_table;
pub use types::{FeeRow, FeeTable, Schedule};
