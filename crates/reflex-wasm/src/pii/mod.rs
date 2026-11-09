//! Personal-data masking for any question text that leaves the browser (AI rephrasing, AI wording, the gap list).
mod mask;
mod types;

pub use mask::mask_pii;
pub use types::PiiKind;
