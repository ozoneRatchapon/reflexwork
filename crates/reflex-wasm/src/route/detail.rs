//! What a route's view needs besides the route name (plan 015 step 4c): the parts of the decision the page would otherwise work out again
//! in JS (`personalAsk`, `stuckTopic` / `stuckPicks`, the programme match, `followUpAspect`, `timeIntent`, `hasStudyIntent`).
//! Computed from the same prepared question and the same state as the route, so the view cannot disagree with the decision.
use super::aspect::follow_up_aspect;
use super::branches::{personal_ask, smalltalk_kind, staff_first, wellbeing_kind, Personal};
use super::dates::{dated_picks, time_intent, TimeIntent};
use super::topic::topic_hits;
use super::manual::Ctx;
use super::near::near_programmes;
use super::programme::programme_match;
use super::stuck::{cat_key, stuck_picks, stuck_topic};
use super::study_intent::has_study_intent;
use super::types::Route;
use super::verdict::manual_verdict;
use crate::decide::Stage;
use super::vocab::vocab;
use crate::resolve::Resolution;
use serde::Serialize;

/// The stuck view: the area named (`None` = no area: offer the areas), the entries of that area, or the areas this manual can answer.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Stuck {
    pub key: Option<&'static str>,
    pub picks: Vec<String>,
    pub areas: Vec<&'static str>,
}

/// One decision: the route name and, for the routes whose view depends on it, the detail. Absent fields are `null` on the JS side.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub route: Option<&'static str>,
    /// personal: "self" | "other"
    pub personal: Option<&'static str>,
    pub stuck: Option<Stuck>,
    /// programme_card / programme_pick (strict match), field_fee / tuition_finder_nomatch (loose match), unsure_programme (the nearest
    /// names, only when the question reads as a misspelt programme name)
    pub programme: Option<Resolution>,
    /// followup: "fee" | "scholarship" | "docs" | "elig" | "english" | "schedule" | "status"
    pub aspect: Option<&'static str>,
    /// time_intent: "registration" | "admissions" | "any"
    pub time_intent: Option<&'static str>,
    /// unsure_programme: the question reads as a study question (the finder opens with the study wording)
    pub study_intent: Option<bool>,
    /// kb_act / advice_*: the id of the entry answered (the top hit, or the entry of the year / term the user named)
    pub entry: Option<String>,
    /// disambiguate / scope_ask / advice_* / time_intent / topic_picks: the ids of the entries offered (or grounding the AI rephrase), best first
    pub offered: Option<Vec<String>>,
    /// the manual's verdict routes: "reflex" (the gate alone) | "rethink" (the second look in the borderline band)
    pub stage: Option<&'static str>,
    /// wellbeing: "crisis" | "stress"; smalltalk: the kind of `classifySmalltalk` ("greet", "thanks", "bye", "whatcan", "howareyou", ...)
    pub kind: Option<String>,
}

fn stuck_view(q: &str, ctx: &Ctx) -> Option<Stuck> {
    let cats = &vocab().stuck_cats;
    match stuck_topic(q)? {
        Some(i) => Some(Stuck { key: Some(cat_key(i)), picks: stuck_picks(&cats[i], i, ctx.manual), areas: Vec::new() }),
        None => {
            let areas = (0..cats.len())
                .filter(|&i| !stuck_picks(&cats[i], i, ctx.manual).is_empty() || (cats[i].key == "login" && ctx.config.agency_has_it))
                .map(cat_key)
                .collect();
            Some(Stuck { key: None, picks: Vec::new(), areas })
        }
    }
}

/// The detail of `route` for the prepared question `q`, read from the state the route was decided in (`ctx` before the route moved the focus;
/// the fields used here are not moved by any route).
pub fn decision(route: Option<Route>, q: &str, ctx: &Ctx) -> Decision {
    let mut d = Decision { route: route.map(Route::name), ..Decision::default() };
    let catalogue = ctx.catalogue;
    match route {
        Some(Route::Wellbeing) => d.kind = wellbeing_kind(q).map(String::from),
        Some(Route::Smalltalk) => d.kind = smalltalk_kind(q),
        Some(Route::Personal) => {
            d.personal = personal_ask(q).map(|p| match p {
                Personal::Other => "other",
                Personal::SelfRecord => "self",
            })
        }
        Some(Route::StuckPick) => d.stuck = stuck_view(q, ctx),
        Some(Route::ProgrammeCard | Route::ProgrammePick) => {
            d.programme = catalogue.and_then(|c| programme_match(q, c, ctx.pinned || staff_first(q, ctx)))
        }
        Some(Route::FieldFee) => d.programme = catalogue.and_then(|c| c.resolve(q, true)),
        Some(Route::Followup) => d.aspect = follow_up_aspect(q),
        Some(Route::TimeIntent) => {
            let intent = time_intent(q);
            d.time_intent = intent.map(|t| match t {
                TimeIntent::Registration => "registration",
                TimeIntent::Admissions => "admissions",
                TimeIntent::Any => "any",
            });
            d.offered = intent.map(|t| dated_picks(ctx.manual.entries(), t, &ctx.today).into_iter().map(|(e, _)| e.id.clone()).collect());
        }
        Some(Route::TopicPicks) => {
            let entries = ctx.manual.entries();
            d.offered = Some(topic_hits(q, entries.iter().map(|e| e.title.as_str())).into_iter().map(|i| entries[i].id.clone()).collect());
        }
        Some(Route::UnsureProgramme) => {
            d.study_intent = Some(has_study_intent(q));
            d.programme = catalogue.and_then(|c| near_programmes(q, c));
        }
        Some(Route::TuitionFinderNomatch) => d.programme = catalogue.and_then(|c| c.resolve(q, true)),
        Some(
            Route::Disambiguate | Route::ScopeAsk | Route::ScopeNoYear | Route::ScopeNoRound | Route::AdviceAbstain | Route::AdviceStrong
            | Route::AdviceHybrid | Route::KbAct,
        ) => {
            let v = manual_verdict(q, ctx);
            d.entry = v.entry.map(|e| e.id.clone());
            d.offered = (!v.offered.is_empty()).then(|| v.offered.iter().map(|e| e.id.clone()).collect());
            d.stage = Some(match v.stage {
                Stage::Reflex => "reflex",
                Stage::Rethink => "rethink",
            });
        }
        _ => {}
    }
    d
}
