use std::collections::HashSet;

/// Where a labelled question comes from. `Synth*` labels are generated and not reviewed by a person.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Group {
    Eval52,
    FaqTh,
    FaqShort,
    FaqTypo,
    FaqEn,
    UncoveredTh,
    UncoveredEn,
    StaffTh,
    StaffEn,
    SynthParaTh,
    SynthParaEn,
    SynthNearMiss,
}

impl Group {
    pub fn label(self) -> &'static str {
        match self {
            Group::Eval52 => "eval52",
            Group::FaqTh => "faq Thai",
            Group::FaqShort => "faq shortened",
            Group::FaqTypo => "faq typo",
            Group::FaqEn => "faq English",
            Group::UncoveredTh => "not in manual (Thai)",
            Group::UncoveredEn => "not in manual (English)",
            Group::StaffTh => "staff-only (Thai)",
            Group::StaffEn => "staff-only (English)",
            Group::SynthParaTh => "synth Thai paraphrase",
            Group::SynthParaEn => "synth English paraphrase",
            Group::SynthNearMiss => "synth near-miss",
        }
    }
    pub fn is_synth(self) -> bool {
        matches!(self, Group::SynthParaTh | Group::SynthParaEn | Group::SynthNearMiss)
    }
}

/// One labelled question: `gold` empty = nothing should be answered.
#[derive(Debug, Clone)]
pub struct Item {
    pub q: String,
    pub gold: HashSet<String>,
    pub group: Group,
}

/// What the shipped search + tier rule did with one question.
#[derive(Debug, Clone)]
pub struct Outcome {
    pub group: Group,
    pub top_id: Option<String>,
    pub top_s: i32,
    pub second_s: Option<i32>,
    /// the top entry is a gold entry
    pub right: bool,
    /// the shipped tier rule answers from the manual (`act`)
    pub shipped_act: bool,
}

/// An answering rule's counts on a set: answered, answered wrong, and right answers kept.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Counts {
    pub n: usize,
    pub answered: usize,
    pub wrong: usize,
    pub positives: usize,
    pub kept: usize,
    pub negatives: usize,
    pub neg_answered: usize,
}
