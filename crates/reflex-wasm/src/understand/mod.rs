//! Verifying the search phrases an AI wrote for an oddly-phrased question (.plans/002 step 4).
//! Port of `understand()` in `submissions/ui/chatbot.html`; contract: `benchmark/golden/understand.json`.
//! The AI only re-words the question; the manual answers, and only when the phrases agree on ONE clear entry.
mod types;
mod verify;

pub use types::{Hit, Understood};
pub use verify::understand;
