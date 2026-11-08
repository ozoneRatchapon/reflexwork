//! The chat's decision order in Rust (plan 009): which branch answers a question. Ported from `_askCore` branch by branch, each step checked
//! against the recorded contract benchmark/golden/route.json (crates/reflex-wasm/tests/golden_route.rs).
pub mod aspect;
pub mod branches;
pub mod dates;
pub mod manual;
pub mod near;
pub mod vocab;
pub mod programme;
pub mod router;
pub mod scope;
pub mod study_intent;
pub mod term_year;
pub mod stuck;
mod stuck_src;
pub mod text;
pub mod topic;
pub mod understood;
pub mod types;
mod unicode_tables;

pub use branches::{decide_prefix, personal_ask, prepare, wellbeing_kind, Personal};
pub use understood::{decide_route, understood_outcome, understood_route};
pub use manual::{Config, Ctx, Manual, ManualEntry, ProgState};
pub use types::Route;
