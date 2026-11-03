use serde::Serialize;

/// What the chat does next.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Answer from the manual.
    Act,
    /// Two entries are too close: ask which one.
    Disambiguate,
    /// Not in the manual (hand-off / not-found path).
    Escalate,
}

/// Which layer decided: the fast gate alone, or the second look ("rethink") in the borderline band.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Reflex,
    Rethink,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Verdict {
    pub action: Action,
    pub stage: Stage,
    /// Why (Thai, shown in the evidence panel): which rule decided.
    pub reason: &'static str,
}
