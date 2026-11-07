//! The last step of the page's order, `understood_by_ai`: when the direct search and every branch before it found nothing, the AI
//! (`/rewrite`) turns the question into search phrases. Each phrase goes through the SAME manual search, and an answer is shown only
//! when the phrases agree on ONE entry that clears the direct-answer bar (port of `understand` in chatbot.html).
//! The AI call itself stays on the page; this module only takes the phrases it returned.
use super::branches::decide_prefix;
use super::manual::{Ctx, Manual};
use super::types::Route;
use crate::understand::{understand, Hit, Understood};

/// Phrase -> search results -> the page's `understand` verdict. Only the top three hits per phrase are used (the page keeps three).
pub fn understood_outcome(manual: &Manual, phrases: &[String]) -> Understood {
    let results: Vec<Vec<Hit>> = phrases
        .iter()
        .map(|p| {
            manual
                .search(p)
                .into_iter()
                .take(3)
                .map(|f| Hit { id: f.entry.id.clone(), score: f64::from(f.hit.s) })
                .collect()
        })
        .collect();
    understand(phrases, &results)
}

/// `understood_by_ai` when the phrases give one clear entry; `None` (continue: the old "not found" reply) otherwise.
pub fn understood_route(manual: &Manual, phrases: &[String]) -> Option<Route> {
    match understood_outcome(manual, phrases) {
        Understood::One { .. } => Some(Route::UnderstoodByAi),
        Understood::Many { .. } | Understood::None => None,
    }
}

/// The whole decision order: the ported prefix first, then the rewrite step. `rewrite` is `None` when the AI step did not run
/// (AI off, or no proxy); `Some(phrases)` is what `/rewrite` returned (empty when it answered nothing).
pub fn decide_route(typed: &str, ctx: &mut Ctx, rewrite: Option<&[String]>) -> Option<Route> {
    decide_prefix(typed, ctx).or_else(|| rewrite.and_then(|phrases| understood_route(ctx.manual, phrases)))
}
