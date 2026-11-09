//! What a route's view needs besides the route name (plan 015 step 4c): the parts of the decision the page would otherwise work out again
//! in JS (`personalAsk`, `stuckTopic` / `stuckPicks`, the programme match, `followUpAspect`, `timeIntent`, `hasStudyIntent`).
//! Computed from the same prepared question and the same state as the route, so the view cannot disagree with the decision.
use super::aspect::follow_up_aspect;
use super::branches::{personal_ask, staff_first, Personal};
use super::dates::{time_intent, TimeIntent};
use super::manual::Ctx;
use super::programme::programme_match;
use super::stuck::{cat_key, stuck_picks, stuck_topic};
use super::study_intent::has_study_intent;
use super::types::Route;
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
    /// programme_card / programme_pick (strict match), field_fee (loose match)
    pub programme: Option<Resolution>,
    /// followup: "fee" | "scholarship" | "docs" | "elig" | "english" | "schedule" | "status"
    pub aspect: Option<&'static str>,
    /// time_intent: "registration" | "admissions" | "any"
    pub time_intent: Option<&'static str>,
    /// unsure_programme: the question reads as a study question (the finder opens with the study wording)
    pub study_intent: Option<bool>,
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
            d.time_intent = time_intent(q).map(|t| match t {
                TimeIntent::Registration => "registration",
                TimeIntent::Admissions => "admissions",
                TimeIntent::Any => "any",
            })
        }
        Some(Route::UnsureProgramme) => d.study_intent = Some(has_study_intent(q)),
        _ => {}
    }
    d
}
