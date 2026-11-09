use crate::types::{Reason, ReasonCounts};

impl Reason {
    pub const ALL: [Reason; 4] = [Reason::Wrong, Reason::OffTopic, Reason::Outdated, Reason::Incomplete];

    pub fn code(self) -> &'static str {
        match self {
            Reason::Wrong => "wrong",
            Reason::OffTopic => "off_topic",
            Reason::Outdated => "outdated",
            Reason::Incomplete => "incomplete",
        }
    }

    /// Strict: only the four codes, exactly. Anything else is dropped by the caller (the vote still counts, without a reason).
    pub fn parse(s: &str) -> Option<Reason> {
        Reason::ALL.into_iter().find(|r| r.code() == s)
    }
}

impl ReasonCounts {
    pub fn get(&self, r: Reason) -> u32 {
        match r {
            Reason::Wrong => self.wrong,
            Reason::OffTopic => self.off_topic,
            Reason::Outdated => self.outdated,
            Reason::Incomplete => self.incomplete,
        }
    }

    pub fn total(&self) -> u32 {
        Reason::ALL.iter().map(|r| self.get(*r)).sum()
    }

    pub fn top(&self) -> Option<Reason> {
        Reason::ALL.into_iter().filter(|r| self.get(*r) > 0).max_by_key(|r| (self.get(*r), std::cmp::Reverse(*r)))
    }
}
