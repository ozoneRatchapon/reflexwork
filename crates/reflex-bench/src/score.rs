//! Run the shipped search + tier rule on a question set, and count what an answering rule does.
use reflex_wasm::decide::{decide_tier, Action};
use reflex_wasm::{kb_rank, KbEntryIn};

use crate::types::{Counts, Item, Outcome};

/// The kernel gate number the experiments use (`experiment.mjs`: `decide({gate: 0.061, ...})`).
pub const GATE: f64 = 0.061;

pub fn outcomes(manual: &[KbEntryIn], items: &[Item]) -> Vec<Outcome> {
    items
        .iter()
        .map(|it| {
            let ranked = kb_rank(manual, &it.q);
            let scores: Vec<f64> = ranked.iter().map(|h| f64::from(h.s)).collect();
            let top = ranked.first();
            Outcome {
                group: it.group,
                top_id: top.map(|h| h.id.clone()),
                top_s: top.map_or(0, |h| h.s),
                second_s: ranked.get(1).map(|h| h.s),
                right: top.is_some_and(|h| it.gold.contains(&h.id)),
                shipped_act: decide_tier(Some(GATE), &scores).action == Action::Act,
            }
        })
        .collect()
}

pub fn count(outs: &[Outcome], answers: impl Fn(&Outcome) -> bool) -> Counts {
    outs.iter().fold(Counts { n: outs.len(), ..Counts::default() }, |mut c, o| {
        let a = answers(o);
        match (o.right, a) {
            (true, true) => {
                c.positives += 1;
                c.kept += 1;
                c.answered += 1;
            }
            (true, false) => c.positives += 1,
            (false, true) => {
                c.negatives += 1;
                c.neg_answered += 1;
                c.answered += 1;
                c.wrong += 1;
            }
            (false, false) => c.negatives += 1,
        }
        c
    })
}
