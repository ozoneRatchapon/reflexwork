//! Retention gate (plan 016 item 5, katgpt-rs `adoption_gate.rs`): a challenger may only replace the shipped arm when it is better
//! net AND it still answers right most of what shipped answered right. A net gain can hide many swaps (fixes some, breaks others);
//! "retained" makes the breakage visible.

/// Per-question comparison of the shipped arm and a challenger on the same questions.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Retention {
    pub n: usize,
    pub shipped_right: usize,
    pub challenger_right: usize,
    /// shipped right and challenger right
    pub kept: usize,
    /// shipped right, challenger wrong
    pub lost: usize,
    /// shipped wrong, challenger right
    pub gained: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateVerdict {
    Adopt,
    NoNetGain,
    BreaksTooMuch,
}

impl Retention {
    pub fn of(shipped: &[bool], challenger: &[bool]) -> Retention {
        assert_eq!(shipped.len(), challenger.len(), "both arms must answer the same questions");
        shipped.iter().zip(challenger).fold(
            Retention { n: shipped.len(), shipped_right: 0, challenger_right: 0, kept: 0, lost: 0, gained: 0 },
            |mut r, (&s, &c)| {
                r.shipped_right += usize::from(s);
                r.challenger_right += usize::from(c);
                match (s, c) {
                    (true, true) => r.kept += 1,
                    (true, false) => r.lost += 1,
                    (false, true) => r.gained += 1,
                    (false, false) => {}
                }
                r
            },
        )
    }

    /// Share of shipped's right answers the challenger keeps (1.0 when shipped has none).
    pub fn retained(&self) -> f64 {
        match self.shipped_right {
            0 => 1.0,
            s => self.kept as f64 / s as f64,
        }
    }

    pub fn net(&self) -> i64 {
        self.gained as i64 - self.lost as i64
    }

    /// Adopt only with a net gain and at least `min_retained` of shipped's right answers kept.
    pub fn verdict(&self, min_retained: f64) -> GateVerdict {
        match (self.net() > 0, self.retained() >= min_retained) {
            (false, _) => GateVerdict::NoNetGain,
            (true, false) => GateVerdict::BreaksTooMuch,
            (true, true) => GateVerdict::Adopt,
        }
    }
}
