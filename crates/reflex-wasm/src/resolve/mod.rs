//! Which programme does a question name? (.plans/002 step 3). Port of `resolveProgramme()` and its helpers in
//! `submissions/ui/chatbot.html`; contract: `benchmark/golden/resolve.json` (527 questions, strict + loose).
//! Index only: the regexes come verbatim from the page (`patterns_src.rs` is generated), `patterns.rs` compiles them.
mod index;
pub(crate) mod patterns;
mod patterns_src;
mod resolver;
mod text;
mod types;

pub use index::Catalogue;
pub use types::{Kind, Programme, Resolution};
