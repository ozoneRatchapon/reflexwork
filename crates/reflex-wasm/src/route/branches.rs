//! The first branches of the chat's decision order, in the order the page tries them (chatbot.html `_askCore`, 2026-11-07):
//!   1 wellbeing  2 smalltalk  3 personal  4 stuck  5 restart / overview  6 catalogue_not_ready
//! `decide_prefix` answers `Some(route)` when one of the ported branches fires and `None` ("continue with the branches not ported yet").
//! The recorded contract (benchmark/golden/route.json, tests/golden_route.rs) checks this prefix exactly.

use super::manual::{Ctx, ProgState};
use super::patterns_src as p;
use super::study_intent::catalogue_notice;
use super::stuck::stuck_fires;
use super::text::{norm_chat, slice_utf16, strip_lead_in, thai_digits_to_ascii};
use super::types::Route;
use crate::re::{compile, compile_src, is_js_space};
use regex_lite::Regex;
use std::sync::OnceLock;

macro_rules! lazy_re {
    ($fname:ident, $pat:expr) => {
        fn $fname() -> &'static Regex {
            static R: OnceLock<Regex> = OnceLock::new();
            R.get_or_init(|| compile(&$pat))
        }
    };
}
lazy_re!(pers_record, p::PERS_RECORD);
lazy_re!(pers_statusq, p::PERS_STATUSQ);
lazy_re!(pers_howto, p::PERS_HOWTO);
lazy_re!(pers_self, p::PERS_SELF);
lazy_re!(pers_own, p::PERS_OWN);
lazy_re!(pers_other, p::PERS_OTHER);
lazy_re!(pers_other_rec, p::PERS_OTHER_REC);
lazy_re!(has_topic, p::HAS_TOPIC);
lazy_re!(overview, p::OVERVIEW);
lazy_re!(restart, p::RESTART);
lazy_re!(wb_crisis, p::WB_CRISIS);
lazy_re!(wb_stress, p::WB_STRESS);

/// `normTermYear`'s guard: only a registration / term question gets its digits and terms rewritten.
fn term_words() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| compile_src(r"ลงทะเบียน|กำหนดการ|เปิดภาค|ปิดภาค|เทอม|ซัมเมอร์|summer|add ?/? ?drop|ถอนรายวิชา", "i"))
}

fn trim_js(s: &str) -> &str {
    s.trim_matches(|c: char| is_js_space(c))
}

fn strip_ws(s: &str) -> String {
    s.chars().filter(|c| !is_js_space(*c)).collect()
}

/// What every branch reads: the typed text, trimmed, capped at 500 UTF-16 units, normalised, with a leading greeting dropped when a real
/// message follows (the page's `q`).
pub fn prepare(typed: &str) -> String {
    let t = slice_utf16(trim_js(typed), 500);
    let n = norm_chat(&t);
    let base = if n.is_empty() { t } else { n };
    let q = strip_lead_in(&base, |rest| smalltalk_kind(rest).is_some());
    match term_words().is_match(&q) {
        true => thai_digits_to_ascii(&q),   // the rest of normTermYear is not ported yet (see text.rs)
        false => q,
    }
}

/// `wellbeingKind`: "crisis" first, then "stress".
pub fn wellbeing_kind(text: &str) -> Option<&'static str> {
    match (wb_crisis().is_match(text), wb_stress().is_match(text)) {
        (true, _) => Some("crisis"),
        (_, true) => Some("stress"),
        _ => None,
    }
}

/// `classifySmalltalk`: the Rust scorer, unless the message names a real topic.
pub fn smalltalk_kind(text: &str) -> Option<String> {
    let k = crate::classify_smalltalk(text);
    match k.is_empty() || has_topic().is_match(text) {
        true => None,
        false => Some(k),
    }
}

/// `personalAsk`: a request for somebody's own record. `Other` = about someone else, `SelfRecord` = the asker's own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Personal {
    Other,
    SelfRecord,
}

pub fn personal_ask(q: &str) -> Option<Personal> {
    match q.is_empty() || pers_howto().is_match(q) {
        true => None,
        false if pers_other().is_match(q) && pers_other_rec().is_match(q) => Some(Personal::Other),
        false if (pers_self().is_match(q) && pers_record().is_match(q) && pers_statusq().is_match(q)) || pers_own().is_match(q) => Some(Personal::SelfRecord),
        false => None,
    }
}

/// `isRestartPhrase`: a whole-utterance control phrase only.
pub fn is_restart_phrase(text: &str) -> bool {
    restart().is_match(&strip_ws(text))
}

/// `isOverviewQuestion`: a short question that names no topic and asks for the highlights.
pub fn is_overview_question(text: &str) -> bool {
    let t = strip_ws(text).to_lowercase();
    t.encode_utf16().count() <= 40 && overview().is_match(&t)
}

/// The ported prefix of the decision order for one typed question. `pinned` = the user tapped a topic chip (it skips the personal / stuck paths).
pub fn decide_prefix(typed: &str, ctx: &Ctx) -> Option<Route> {
    let pinned = ctx.pinned;
    let q = prepare(typed);
    if wellbeing_kind(&q).is_some() {
        return Some(Route::Wellbeing);
    }
    if smalltalk_kind(&q).is_some() {
        return Some(Route::Smalltalk);
    }
    if !pinned && personal_ask(&q).is_some() {
        return Some(Route::Personal);
    }
    if !pinned && stuck_fires(&q, ctx.manual, &ctx.config) {
        return Some(Route::StuckPick);
    }
    match (is_restart_phrase(&q), is_overview_question(&q)) {
        (true, _) => return Some(Route::Restart),
        (_, true) => return Some(Route::Overview),
        _ => {}
    }
    // 6: the catalogue is not usable and the question reads like a programme question
    if !pinned && matches!(ctx.prog_state, ProgState::Loading | ProgState::Failed) && catalogue_notice(&q) {
        return Some(Route::CatalogueNotReady);
    }
    None
}
