//! Answer formatting shared by the web chat and the LINE bot (.plans/002 step 1).
//! Ports of `answerPoints()` / `slotLead()` in `submissions/ui/chatbot.html`, with JS string semantics
//! (UTF-16 code units, JS whitespace set). The contract is `benchmark/golden/answer_points.json`.
mod js_text;
mod points;
mod slot;

pub use points::answer_points;
pub use slot::slot_lead;
