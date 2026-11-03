use serde::Serialize;

/// A personal or technical issue (account locked, data stuck, a system error): staff must handle it, so the chat collects the
/// details staff always ask for instead of searching the manual.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Issue {
    /// Always "personal" (the page's `kind`).
    pub kind: &'static str,
    pub category: &'static str,
    pub label: &'static str,
}
