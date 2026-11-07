//! The page-facing entry point of the decision order: the page passes what it knows (the manual, the catalogue, its state),
//! Rust returns the route name. Pure (no wasm types here): the wasm wrapper lives in `lib.rs`.
use super::{decide_route, Config, Ctx, Manual, ManualEntry, ProgState};
use crate::resolve::Catalogue;
use serde::Deserialize;

/// Manual entry as the page holds it (`KB` rows of knowledge-index.json, plus live staff answers).
#[derive(Deserialize)]
pub struct KbIn {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub keywords: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub staff: bool,
    #[serde(default)]
    pub academic_year: Option<String>,
    #[serde(default)]
    pub semester: Option<String>,
}

/// The page's state at the moment a question is asked (read BEFORE the page clears its pin or focus).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateIn {
    /// `PROG_STATE`: "loading" | "ok" | "failed" | "none"
    pub prog_state: String,
    pub ai_off: bool,
    /// `PIN.id` when a topic chip was tapped for this very question
    #[serde(default)]
    pub pinned_id: Option<String>,
    /// `PCTX.code` (the programme the last card was about)
    #[serde(default)]
    pub programme_in_focus: Option<String>,
    pub today: String,
    #[serde(default = "default_true")]
    pub agency_has_it: bool,
}

fn default_true() -> bool {
    true
}

/// Unknown state strings are an error, not a silent default: the shadow check must see them.
pub fn parse_prog_state(s: &str) -> Result<ProgState, String> {
    match s {
        "ok" => Ok(ProgState::Ok),
        "loading" => Ok(ProgState::Loading),
        "failed" => Ok(ProgState::Failed),
        "none" => Ok(ProgState::None),
        other => Err(format!("unknown prog_state {other:?}")),
    }
}

/// Decide one question from the page's state. `rewrite`: `None` when the AI step did not run; `Some(phrases)` otherwise.
pub fn route_name(
    typed: &str,
    state: &StateIn,
    manual: &Manual,
    catalogue: Option<&Catalogue>,
    rewrite: Option<&[String]>,
) -> Result<Option<&'static str>, String> {
    let prog_state = parse_prog_state(&state.prog_state)?;
    let mut ctx = Ctx {
        pinned: state.pinned_id.is_some(),
        prog_state,
        ai_off: state.ai_off,
        pinned_entry: state.pinned_id.clone(),
        programme_in_focus: state.programme_in_focus.clone(),
        today: state.today.clone(),
        catalogue: if prog_state == ProgState::Ok { catalogue } else { None },
        manual,
        config: Config { agency_has_it: state.agency_has_it },
    };
    Ok(decide_route(typed, &mut ctx, rewrite).map(|r| r.name()))
}

/// The manual the page's KB rows describe.
pub fn manual_from(rows: Vec<KbIn>) -> Manual {
    Manual::new(
        rows.into_iter()
            .map(|e| ManualEntry {
                id: e.id,
                title: e.title,
                keywords: e.keywords,
                staff: e.staff,
                category: e.category,
                answer: e.answer,
                academic_year: e.academic_year,
                semester: e.semester,
            })
            .collect(),
    )
}
