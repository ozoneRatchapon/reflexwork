//! The first branches of the chat's decision order, in the order the page tries them (chatbot.html `_askCore`, 2026-11-07):
//!   1 wellbeing  2 smalltalk  3 personal  4 stuck  5 restart / overview  6 catalogue_not_ready  7 generic_fee  8-9 programme_card / programme_pick  10-15 field_fee, free_study, career, finder, followup, free_fee  16 time_intent  17+ verdict: scope_*, advice_*, kb_act, disambiguate
//! `decide_prefix` answers `Some(route)` when one of the ported branches fires and `None` ("continue with the branches not ported yet").
//! The recorded contract (benchmark/golden/route.json, tests/golden_route.rs) checks this prefix exactly.

use super::aspect::{asks_if_free, follow_up_aspect, is_generic_fee_question, is_tuition_question, mentions_free_study, names_a_fee};
use super::dates::{dated_picks, time_intent};
use super::manual::{Ctx, ProgState};
use super::verdict::manual_verdict;
use super::programme::{is_career_question, is_finder_question, is_level_only_question, resolve_programme_branch, ProgrammeOutcome};
use super::vocab::vocab;
use super::study_intent::{catalogue_notice, has_study_intent};
use super::near::near_programmes;
use super::topic::topic_picks;
use super::stuck::stuck_fires;
use super::term_year::norm_term_year;
use super::text::{norm_chat, slice_utf16, strip_lead_in};
use super::types::Route;
use crate::re::{compile, is_js_space};
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
lazy_re!(pers_record, vocab().pers_record);
lazy_re!(pers_statusq, vocab().pers_statusq);
lazy_re!(pers_howto, vocab().pers_howto);
lazy_re!(pers_self, vocab().pers_self);
lazy_re!(pers_own, vocab().pers_own);
lazy_re!(pers_other, vocab().pers_other);
lazy_re!(pers_other_rec, vocab().pers_other_rec);
lazy_re!(has_topic, vocab().has_topic);
lazy_re!(overview, vocab().overview);
lazy_re!(restart, vocab().restart);
lazy_re!(wb_crisis, vocab().wb_crisis);
lazy_re!(wb_stress, vocab().wb_stress);
lazy_re!(p_ack, vocab().p_ack);

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
    norm_term_year(&q)
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

/// A staff-written answer matches this question clearly (s >= 6): it wins over the programme resolver and the later programme branches.
pub fn staff_first(q: &str, ctx: &Ctx) -> bool {
    !ctx.pinned && ctx.manual.search(q).first().is_some_and(|f| f.entry.staff && f.hit.s >= 6)
}

/// The ported prefix of the decision order for one typed question. `pinned` = the user tapped a topic chip (it skips the personal / stuck paths).
pub fn decide_prefix(typed: &str, ctx: &mut Ctx) -> Option<Route> {
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
        (true, _) => {
            ctx.programme_in_focus = None;   // `if(restart){ PCTX=null; PIN=null; }`
            return Some(Route::Restart);
        }
        (_, true) => return Some(Route::Overview),
        _ => {}
    }
    // 6: the catalogue is not usable and the question reads like a programme question
    if !pinned && matches!(ctx.prog_state, ProgState::Loading | ProgState::Failed) && catalogue_notice(&q) {
        return Some(Route::CatalogueNotReady);
    }
    // 7: "ค่าเทอมเท่าไร" with no programme or field: fees differ per programme, so open the fee finder (unless it is a follow-up about the programme in focus)
    if !pinned && ctx.prog_state == ProgState::Ok && names_a_fee(&q) && !asks_if_free(&q) && is_generic_fee_question(&q)
        && !(ctx.programme_in_focus.is_some() && follow_up_aspect(&q).is_some())
    {
        ctx.programme_in_focus = None;   // `PCTX=null; renderFinder(...)`
        return Some(Route::GenericFee);
    }
    // 8-9: a staff answer that clearly matches wins over the programme resolver; otherwise the resolver gives a card or a picker (or the question goes on)
    let staff_first = staff_first(&q, ctx);
    if ctx.prog_state == ProgState::Ok {
        if let Some(cat) = ctx.catalogue {
            match resolve_programme_branch(&q, cat, pinned || staff_first) {
                Some(ProgrammeOutcome::Card(code)) => {
                    ctx.programme_in_focus = Some(code);
                    return Some(Route::ProgrammeCard);
                }
                Some(ProgrammeOutcome::Pick) => {
                    ctx.programme_in_focus = None;   // a picker is on screen: a later "แล้วค่าเทอมล่ะ" must not refer to the programme from before it
                    return Some(Route::ProgrammePick);
                }
                None => {}
            }
        }
    }
    if let (ProgState::Ok, Some(cat)) = (ctx.prog_state, ctx.catalogue) {
        if !pinned && !staff_first {
            // 10: a fee question that names a field but not one programme ("ค่าเทอมพยาบาล"): the programmes of that field, not a wrong-topic entry
            if is_tuition_question(&q) && !asks_if_free(&q) && cat.resolve(&q, true).is_some_and(|r| !r.codes.is_empty()) {
                ctx.programme_in_focus = None;
                return Some(Route::FieldFee);
            }
            // 11: "...ฟรี" about studying: never confirm a free premise
            if asks_if_free(&q) && mentions_free_study(&q) {
                return Some(Route::FreeStudy);
            }
            // 12-13: career-first questions and finder questions open the facet finder
            if is_career_question(&q) {
                ctx.programme_in_focus = None;
                return Some(Route::Career);
            }
            if is_finder_question(&q) || is_level_only_question(&q) {
                ctx.programme_in_focus = None;
                return Some(Route::Finder);
            }
        }
        // 14: a follow-up about the programme just shown ("แล้วค่าเทอมล่ะ"), when the question names no programme or field of its own
        if ctx.programme_in_focus.is_some() && !pinned && !staff_first && cat.resolve(&q, true).is_none() && follow_up_aspect(&q).is_some() {
            return Some(Route::Followup);
        }
        // 15: a yes/no question with a premise about fees
        if !pinned && asks_if_free(&q) && names_a_fee(&q) {
            return Some(Route::FreeFee);
        }
    }
    // 16: "ตอนนี้ลงทะเบียนทันไหม": the dated schedules of the manual, nearest to today first
    if !pinned && !staff_first {
        if let Some(intent) = time_intent(&q) {
            if !dated_picks(ctx.manual.entries(), intent, &ctx.today).is_empty() {
                return Some(Route::TimeIntent);
            }
        }
    }
    // the verdict escalated (no manual answer): the not-found family, in the page's order; only its first two branches are ported
    match manual_verdict(&q, ctx).route {
        Some(route) => Some(route),
        None => not_found_family(&q, ctx),
    }
}

fn has_thai(s: &str) -> bool {
    s.chars().any(|c| ('\u{0E00}'..='\u{0E7F}').contains(&c))
}

/// `isNotAQuestion`: a bare acknowledgement, a lone URL, or an ASCII text with at most two letters. Any Thai letter makes it a question.
pub fn is_not_a_question(q: &str) -> bool {
    let s = trim_js(q);
    if has_thai(s) {
        return false;
    }
    p_ack().is_match(s) || is_bare_url(s) || (s.is_ascii() && s.chars().filter(|c| c.is_ascii_alphabetic()).count() <= 2)
}

/// `/^https?:\/\/\S+$/i`: one URL and nothing else.
fn is_bare_url(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"));
    rest.is_some_and(|r| !r.is_empty() && !r.chars().any(is_js_space))
}

/// `isOtherScript`: a Japanese, Chinese, Korean, Arabic or Cyrillic letter and no Thai.
pub fn is_other_script(q: &str) -> bool {
    !has_thai(q) && q.chars().any(|c| matches!(c, '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7AF}' | '\u{0600}'..='\u{06FF}' | '\u{0400}'..='\u{04FF}'))
}

/// `isEnglish`: a Latin letter and no Thai.
pub fn is_english(q: &str) -> bool {
    !has_thai(q) && q.chars().any(|c| c.is_ascii_alphabetic())
}

/// The not-found family, in the page's order (`isNotAQuestion`, `isOtherScript`, `isEnglish`, `classifyIssue` -> intake, then the
/// programme and tuition finders when the catalogue is loaded, then the topic picks); the not-found branch is not ported yet (`None`).
fn not_found_family(q: &str, ctx: &Ctx) -> Option<Route> {
    match (is_not_a_question(q), is_other_script(q), is_english(q)) {
        (true, _, _) => Some(Route::NotAQuestion),
        (_, true, _) => Some(Route::OtherScript),
        (_, _, true) => Some(Route::EnglishOffCorpus),
        _ => match crate::intake::classify_issue(q) {
            Some(_) => Some(Route::Intake),
            None => finder_branches(q, ctx),
        },
    }
}

/// `unsure_programme`, `tuition_finder_nomatch` (both need the catalogue; the page checks `PROG.length`), then `topic_picks` (any catalogue state).
fn finder_branches(q: &str, ctx: &Ctx) -> Option<Route> {
    if let Some(cat) = ctx.catalogue {
        if has_study_intent(q) || near_programmes(q, cat).is_some() {
            return Some(Route::UnsureProgramme);
        }
        if is_tuition_question(q) {
            return Some(Route::TuitionFinderNomatch);
        }
    }
    topic_picks(q, ctx.manual.entries().iter().map(|e| e.title.as_str())).then_some(Route::TopicPicks)
}
