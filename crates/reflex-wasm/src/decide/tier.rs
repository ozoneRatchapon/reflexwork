use super::types::{Action, Stage, Verdict};

/// The borderline band of the kernel's sigmoid gate (`_BAND` in chatbot.html).
const BAND_LOW: f64 = 0.60;
const BAND_HIGH: f64 = 0.80;

const fn verdict(action: Action, stage: Stage) -> Verdict {
    Verdict { action, stage }
}

/// Port of `decideTier({gate, ranked})`. `gate` is `None` when the kernel gave no number; `scores` are the search
/// scores of the ranked entries, best first. The order of the rules is the JS order.
pub fn decide_tier(gate: Option<f64>, scores: &[f64]) -> Verdict {
    let top = scores.first().copied();
    let second = scores.get(1).copied();
    if gate.is_some_and(|g| g < BAND_LOW) && top.is_some_and(|t| t >= 4.0) {
        return verdict(Action::Act, Stage::Reflex);
    }
    if gate.is_some_and(|g| g >= BAND_HIGH) && !top.is_some_and(|t| t >= 6.0) {
        return verdict(Action::Escalate, Stage::Reflex);
    }
    match (top, second) {
        (Some(t), s) if t >= 4.0 && s.is_none_or(|s| t - s >= 2.0) => verdict(Action::Act, Stage::Rethink),
        (Some(t), Some(s)) if t >= 2.0 && t - s <= 1.0 => verdict(Action::Disambiguate, Stage::Rethink),
        (Some(t), _) if t >= 3.0 => verdict(Action::Act, Stage::Rethink),
        _ => verdict(Action::Escalate, Stage::Rethink),
    }
}
