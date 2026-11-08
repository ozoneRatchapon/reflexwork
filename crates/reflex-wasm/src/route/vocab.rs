//! The route vocabulary: the regex sources of the chat's decision order (the words and phrases each branch matches).
//! They are DATA, not code. The default is the graduate-school pack, `packs/graduate-school/vocab.json`, embedded at build time, so the
//! default behaviour is unchanged; a deployment may install another pack's `vocab.json` through `Router::new` (plan 011 step 1).
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

/// Parse a pack's `vocab.json`. Unknown or missing keys are errors: a pack must state every pattern.
pub fn parse(json: &str) -> Result<Vocab, String> {
    serde_json::from_str(json).map_err(|e| format!("vocab.json: {e}"))
}

static VOCAB: OnceLock<Vocab> = OnceLock::new();

/// Install the pack for this process. Fails if a different pack was already installed (or the default was already used).
pub fn install(json: &str) -> Result<(), String> {
    let v = parse(json)?;
    VOCAB.set(v).map_err(|_| "a vocabulary is already installed in this process".to_string())
}

/// The installed pack, or the embedded graduate-school default.
pub fn vocab() -> &'static Vocab {
    VOCAB.get_or_init(|| parse(DEFAULT_JSON).expect("embedded graduate-school vocab.json is valid"))
}
