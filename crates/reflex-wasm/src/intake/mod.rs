//! Reading what kind of message this is, before the manual is searched (.plans/002 step 2).
//! Ports of `classifyIssue()`, `isAdvice()` and `isEnglish()` in `submissions/ui/chatbot.html` (also used by the LINE bot through
//! `integrations/_shared/intake.mjs`); contract: `benchmark/golden/intake.json`. The regexes come verbatim from the page.
mod classify;
mod patterns;
mod patterns_src;
mod types;

pub use classify::{classify_issue, is_advice, is_english};
pub use types::Issue;
