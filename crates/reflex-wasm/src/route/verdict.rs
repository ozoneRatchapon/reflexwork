//! Step 17+ of the decision order: the manual's verdict. The gate score + the ranked entries -> act / disambiguate / escalate, the
//! account-problem override, the scope guard, then the advice / plain-answer split (the page's `decideTier` ... `kb_act` block).
//! One computation gives both the route and what its view shows (the entry answered, the entries offered), so a client without its own
//! search (the LINE worker) renders exactly what was decided.
use super::manual::{Ctx, ManualEntry};
use super::scope::{scope_clarify, Ranked, Scope};
use super::types::Route;
use crate::decide::{decide_tier, Action, Stage};

/// How many entries a disambiguation offers, and how many ground an advice answer (the page's `slice(0,3)` / `groundedContext`).
const OFFERED: usize = 3;

/// The verdict of the manual for one prepared question.
#[derive(Debug, Clone)]
pub struct ManualVerdict<'a> {
    /// `None`: the manual has no answer (the not-found family follows)
    pub route: Option<Route>,
    pub stage: Stage,
    /// the entry answered (kb_act, advice_*): the top hit, or the entry of the year / term the user named
    pub entry: Option<&'a ManualEntry>,
    /// the entries offered: disambiguate (the closest three), scope_ask (the years / terms), advice_* (the grounding of the AI rephrase)
    pub offered: Vec<&'a ManualEntry>,
}

fn ranked_for<'a>(q: &str, ctx: &Ctx<'a>) -> Vec<Ranked<'a>> {
    let manual = ctx.manual;
    match ctx.pinned {
        // a tapped chip answers THAT entry
        true => ctx
            .pinned_entry
            .as_deref()
            .and_then(|id| manual.entries().iter().find(|e| e.id == id))
            .map(|entry| vec![Ranked { entry, s: 9 }])
            .unwrap_or_default(),
        false => manual.search(q).into_iter().map(|f| Ranked { entry: f.entry, s: f.hit.s }).collect(),
    }
}

fn by_id<'a>(ctx: &Ctx<'a>, ids: &[String]) -> Vec<&'a ManualEntry> {
    let entries = ctx.manual.entries();
    ids.iter().filter_map(|id| entries.iter().find(|e| &e.id == id)).collect()
}

fn top<'a>(ranked: &[Ranked<'a>], n: usize) -> Vec<&'a ManualEntry> {
    ranked.iter().take(n).map(|r| r.entry).collect()
}

/// The verdict for the prepared question `q`.
pub fn manual_verdict<'a>(q: &str, ctx: &Ctx<'a>) -> ManualVerdict<'a> {
    let ranked = ranked_for(q, ctx);
    let (_, gate) = crate::route_with_gate(&crate::encode("DataQuery", q, 2048, 128));
    let scores: Vec<f64> = ranked.iter().map(|r| f64::from(r.s)).collect();
    let tier = decide_tier(Some(f64::from(gate)), &scores);
    let mut action = tier.action;
    // a real personal account / system problem wins over a loose or tied guess in the manual
    if let Some(first) = ranked.first() {
        let tied = ranked.get(1).is_some_and(|r| r.s == first.s);
        if action == Action::Act && (first.s < 4 || tied) && !first.entry.staff && crate::intake::classify_issue(q).is_some() {
            action = Action::Escalate;
        }
    }
    let none = |stage| ManualVerdict { route: None, stage, entry: None, offered: Vec::new() };
    let mut v = none(tier.stage);
    match action {
        Action::Escalate => return v,
        Action::Disambiguate => {
            v.route = Some(Route::Disambiguate);
            v.offered = top(&ranked, OFFERED);
            return v;
        }
        Action::Act => {}
    }
    v.entry = ranked.first().map(|r| r.entry);
    match scope_clarify(q, &ranked, ctx.manual.entries()) {
        Some(Scope::Ask { candidates, .. }) => {
            v.route = Some(Route::ScopeAsk);
            v.entry = None;
            v.offered = by_id(ctx, &candidates);
            return v;
        }
        Some(Scope::NoYear) => return ManualVerdict { route: Some(Route::ScopeNoYear), ..none(tier.stage) },
        Some(Scope::NoRound) => return ManualVerdict { route: Some(Route::ScopeNoRound), ..none(tier.stage) },
        Some(Scope::Pick(id)) => v.entry = by_id(ctx, &[id]).first().copied().or(v.entry),
        None => {}
    }
    // advice questions are rephrased with the AI when it is on; a factual or plain question is answered from the manual as it is
    if crate::intake::is_advice(q) && !ctx.ai_off {
        let top_score = ranked.first().map_or(0, |r| r.s);
        v.route = Some(if top_score < 4 {
            Route::AdviceAbstain
        } else if top_score >= 6 || ranked.iter().take(OFFERED).any(|r| r.entry.staff) {
            Route::AdviceStrong
        } else {
            Route::AdviceHybrid
        });
        v.offered = top(&ranked, OFFERED);
        return v;
    }
    v.route = Some(Route::KbAct);
    v
}
