//! The route vocabulary: the regex sources of the chat's decision order (the words and phrases each branch matches).
//! They are DATA, not code. The default is the graduate-school pack, `packs/graduate-school/vocab.json`, embedded at build time, so the
//! default behaviour is unchanged; a deployment may install another pack's `vocab.json` through `Router::new` (plan 011 step 1). A pack's
//! file lists only the keys it changes; the rest are the default's (`parse`, plan 019 step 3.1).
//!
//! Copied from chatbot.html (2026-11-07) and rewritten where JS used lookaheads, which `regex-lite` lacks: `X(?!c)` -> `X(?:[^c]|$)`
//! and `ท้อ(?!ง)` -> `ท้อ(?:[^ง]|$)`; the match is only ever read as yes/no.
//! A pack is installed once per process (`OnceLock`): install it before any route call.
use crate::re::Re;
use serde::{Deserialize, Deserializer};
use std::sync::OnceLock;

/// The embedded default pack (graduate school). Path is relative to this file.
const DEFAULT_JSON: &str = include_str!("../../../../packs/graduate-school/vocab.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vocab {
    pub pers_record: Re,
    pub pers_statusq: Re,
    pub pers_howto: Re,
    pub pers_self: Re,
    pub pers_own: Re,
    pub pers_other: Re,
    pub pers_other_rec: Re,
    pub has_topic: Re,
    pub lead_in: Re,
    pub overview: Re,
    pub restart: Re,
    pub wb_crisis: Re,
    pub wb_stress: Re,
    pub not_study: Re,
    pub study_words: Re,
    pub career_or_open: Re,
    pub free_q: Re,
    pub aspect_docs: Re,
    pub aspect_elig: Re,
    pub aspect_english: Re,
    pub aspect_schedule: Re,
    pub aspect_status: Re,
    pub programme_code: Re,
    pub general_words: Re,
    pub fee_words: Re,
    pub fee_filler: Re,
    pub findq: Re,
    pub level_fill: Re,
    pub en_fill: Re,
    pub en_ask_schedule: Re,
    pub en_ask_status: Re,
    pub tuition: Re,
    pub nontuition: Re,
    pub career: Re,
    pub freestudy: Re,
    pub time_w: Re,
    pub time_rest: Re,
    pub snapshot: Re,
    pub p_ack: Re,
    pub p_core_drop: Re,
    pub topic_head: Re,
    pub topic_tail: Re,
    pub tny_guard: Re,
    pub tny_term_year: Re,
    pub tny_summer: Re,
    pub tny_first: Re,
    pub tny_second: Re,
    pub tny_year: Re,
    pub scope_reg: Re,
    pub scope_money: Re,
    pub scope_ay: Re,
    pub round_th: Re,
    pub round_en: Re,
    pub round_in_title: Re,
    pub term_first_pat: Re,
    pub term_second_pat: Re,
    pub term_summer_pat: Re,
    pub words: Words,
    pub stuck_w: Re,
    pub stuck_fill: Re,
    pub stuck_cats: Vec<StuckCatVocab>,
    pub intake_issues: Vec<IntakeIssueVocab>,
    pub not_personal: Re,
    pub advice: Re,
    pub factual: Re,
    /// "มีสาขา X ไหม", "is there ...": a question whether something exists (the body-list lookup, `route::body_terms`)
    pub exists_q: Re,
    pub resolve: ResolveVocab,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// The programme-matching regexes (plan 015 step 3): the resolver's lead, tail, degree, qualifier and intent words, the fee and
/// ask topics, and the level letters. Keys of `topics`, `asks` and `levels` are the labels the resolver returns.
pub struct ResolveVocab {
    pub lead: Re,
    pub tail: Re,
    pub degree: Re,
    pub qual: Re,
    pub paren: Re,
    pub other: Re,
    pub intent: Re,
    pub func: Re,
    pub topics: Vec<KeyRe>,
    pub asks: Vec<KeyRe>,
    pub levels: Vec<KeyRe>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// A labelled regex (`key` names the match: a topic, an ask, or a level letter).
pub struct KeyRe {
    pub key: String,
    pub re: Re,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// One account / system problem category of the intake (plan 015 step 2). The first category whose pattern matches wins.
pub struct IntakeIssueVocab {
    pub category: String,
    pub label: String,
    pub re: Re,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// One "ติดปัญหา" area: its key, the words that name it (`topic`), the title filter and the seed phrases (plan 011 step 3).
pub struct StuckCatVocab {
    pub key: String,
    pub topic: Re,
    pub title: Re,
    pub seeds: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// Words the term, year and round logic writes out or compares (plan 011 step 2).
pub struct Words {
    pub term_first: String,
    pub term_second: String,
    pub term_summer: String,
    pub academic_year: String,
    pub fee_term: String,
    pub round_first: String,
    pub admissions_category: String,
}

#[derive(Deserialize)]
struct RawRe {
    src: String,
    flags: String,
}

/// A pack's regex is read once per process, so its text is leaked into a `'static` slice (bounded: one vocab per process).
impl<'de> Deserialize<'de> for Re {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = RawRe::deserialize(d)?;
        Ok(Re { src: Box::leak(raw.src.into_boxed_str()), flags: Box::leak(raw.flags.into_boxed_str()) })
    }
}

/// A value replaced whole by a pack: a pattern (`{src, flags}`), a string, a list. Only the other objects (`words`) are merged key by key,
/// so a pack can never give a pattern's `src` and silently keep the default's `flags`.
fn is_leaf(v: &serde_json::Value) -> bool {
    !v.is_object() || v.get("src").is_some()
}

/// Lay `pack` over `base` (the default). A key the default lacks is an error naming its path (`words.round_first`).
fn overlay(base: &mut serde_json::Value, pack: serde_json::Value, path: &str) -> Result<(), String> {
    let (serde_json::Value::Object(b), serde_json::Value::Object(p)) = (&mut *base, pack) else {
        return Err(format!("vocab.json: `{}` must be an object", if path.is_empty() { "(top level)" } else { path }));
    };
    for (k, v) in p {
        let at = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
        let slot = b.get_mut(&k).ok_or_else(|| format!("vocab.json: unknown key `{at}`"))?;
        match is_leaf(slot) {
            true => *slot = v,
            false => overlay(slot, v, &at)?,
        }
    }
    Ok(())
}

/// Parse a pack's `vocab.json` (plan 019 step 3.1): the keys it gives replace the embedded graduate-school default, the keys it leaves out
/// keep the default, an unknown key is an error. So a pack lists only the words it changes.
pub fn parse(json: &str) -> Result<Vocab, String> {
    serde_json::from_value(merged(json)?).map_err(|e| format!("vocab.json: {e}"))
}

fn merged(json: &str) -> Result<serde_json::Value, String> {
    let mut base: serde_json::Value = serde_json::from_str(DEFAULT_JSON).map_err(|e| format!("embedded vocab.json: {e}"))?;
    let pack: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("vocab.json: {e}"))?;
    overlay(&mut base, pack, "")?;
    Ok(base)
}

/// Patterns the engine rewrites before compiling (lookaheads `regex-lite` lacks), with the same rewrite the engine uses.
type Prepare = fn(&str) -> Result<String, String>;
const PREPARED: [(&str, Prepare); 1] = [("resolve.lead", crate::resolve::patterns::lead_src)];

/// Every pattern of the merged vocabulary compiles here; the first that does not is named by its path (`stuck_cats[2].topic`).
fn compile_all(v: &serde_json::Value, path: &str) -> Result<(), String> {
    use serde_json::Value;
    match v {
        Value::Object(o) => match (o.get("src").and_then(Value::as_str), o.get("flags").and_then(Value::as_str)) {
            (Some(src), Some(flags)) => {
                let bad = |e: String| format!("vocab.json: `{path}` does not compile: {e}");
                let src = match PREPARED.iter().find(|(p, _)| *p == path) {
                    Some((_, prepare)) => prepare(src).map_err(bad)?,
                    None => src.to_owned(),
                };
                crate::re::try_compile(&src, flags).map(|_| ()).map_err(bad)
            }
            _ => o.iter().try_for_each(|(k, x)| compile_all(x, &if path.is_empty() { k.clone() } else { format!("{path}.{k}") })),
        },
        Value::Array(a) => a.iter().enumerate().try_for_each(|(i, x)| compile_all(x, &format!("{path}[{i}]"))),
        _ => Ok(()),
    }
}

/// Parse a pack's vocabulary and compile every pattern in it, so a bad pack fails when it is loaded (the build, `Router::new`), never
/// in the middle of a conversation.
pub fn check(json: &str) -> Result<Vocab, String> {
    let m = merged(json)?;
    compile_all(&m, "")?;
    serde_json::from_value(m).map_err(|e| format!("vocab.json: {e}"))
}

/// The default goes through the same `from_value` as a pack: one `Deserialize` instantiation in the wasm, not two (-37 KB of wasm, 2026-11-14).
fn parse_default() -> Vocab {
    parse("{}").expect("embedded graduate-school vocab.json is valid")
}

static VOCAB: OnceLock<Vocab> = OnceLock::new();

/// Install the pack for this process. Fails if a different pack was already installed (or the default was already used).
pub fn install(json: &str) -> Result<(), String> {
    let v = check(json)?;
    VOCAB.set(v).map_err(|_| "a vocabulary is already installed in this process".to_string())
}

/// The installed pack, or the embedded graduate-school default.
pub fn vocab() -> &'static Vocab {
    VOCAB.get_or_init(parse_default)
}
