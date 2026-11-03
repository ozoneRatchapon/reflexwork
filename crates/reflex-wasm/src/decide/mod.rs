//! What to do with a question once the manual has been searched (.plans/002 step 4).
//! Port of `decideTier()` in `submissions/ui/chatbot.html`; contract: `benchmark/golden/decide_tier.json`.
mod tier;
mod types;

pub use tier::decide_tier;
pub use types::{Action, Stage, Verdict};
