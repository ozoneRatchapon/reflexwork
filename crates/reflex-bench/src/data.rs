//! The labelled question sets, read from the repo exactly as `benchmark/abstain/experiment.mjs` builds them, plus the generated
//! (unreviewed) paraphrase / near-miss set `benchmark/synth/questions_001.json`.
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use regex_lite::Regex;
use reflex_wasm::KbEntryIn;
use serde::Deserialize;

use crate::types::{Group, Item};

pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(root: &Path, rel: &str) -> Result<String, String> {
    fs::read_to_string(root.join(rel)).map_err(|e| format!("{rel}: {e}"))
}

#[derive(Deserialize)]
struct KbRow {
    id: String,
    keywords: String,
}

/// The published manual (`python3 submissions/build_knowledge_index.py` builds it).
pub fn manual(root: &Path) -> Result<Vec<KbEntryIn>, String> {
    let rows: Vec<KbRow> = serde_json::from_str(&read(root, "submissions/ui/knowledge-index.json")?).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| KbEntryIn { id: r.id, keywords: r.keywords }).collect())
}

/// JS `typo` in experiment.mjs: drop up to 2 Thai consonants, every 7th code point from index 2 (indices shift after a drop).
pub fn typo(q: &str) -> String {
    let mut c: Vec<char> = q.chars().collect();
    let (mut i, mut n) = (2usize, 0);
    while i + 1 < c.len() && n < 2 {
        if ('\u{0E01}'..='\u{0E2E}').contains(&c[i]) {
            c.remove(i);
            n += 1;
        }
        i += 7;
    }
    c.into_iter().collect()
}

/// JS `short`: the first 6 whitespace-separated words.
pub fn short(q: &str) -> String {
    let parts: Vec<&str> = q.split(char::is_whitespace).filter(|s| !s.is_empty()).collect();
    parts.into_iter().take(6).collect::<Vec<_>>().join(" ")
}

/// eval52: the `[question, expected id | null, kind]` rows and the `ALT` extra gold ids in `tests/kb_search.test.mjs`.
fn eval52(root: &Path, ids: &HashSet<String>) -> Result<Vec<Item>, String> {
    let src = read(root, "tests/kb_search.test.mjs")?;
    let row = Regex::new(r"(?m)^\s*\['([^']+)',\s*(null|'[^']*'),\s*'([^']*)'\],?$").map_err(|e| e.to_string())?;
    let alt_block = src.split("const ALT = {").nth(1).and_then(|s| s.split("\n};").next()).unwrap_or("");
    let alt_row = Regex::new(r"'([^']+)':\s*\[([^\]]*)\]").map_err(|e| e.to_string())?;
    let quoted = Regex::new(r"'([^']+)'").map_err(|e| e.to_string())?;
    let alt: HashMap<String, Vec<String>> = alt_row
        .captures_iter(alt_block)
        .map(|c| (c[1].to_string(), quoted.captures_iter(&c[2]).map(|q| q[1].to_string()).collect()))
        .collect();
    Ok(row
        .captures_iter(&src)
        .filter_map(|c| {
            let q = c[1].to_string();
            let exp = match &c[2] {
                "null" => None,
                s => Some(s.trim_matches('\'').to_string()),
            };
            match &exp {
                Some(e) if !ids.contains(e) => None,
                _ => {
                    let mut gold: HashSet<String> = exp.into_iter().collect();
                    if !gold.is_empty() {
                        gold.extend(alt.get(&q).cloned().unwrap_or_default());
                    }
                    Some(Item { q, gold, group: Group::Eval52 })
                }
            }
        })
        .collect())
}

#[derive(Deserialize)]
struct FaqFile {
    items: Vec<FaqItem>,
}
#[derive(Deserialize)]
struct FaqItem {
    th: String,
    en: String,
    student: bool,
    gold_kb_ids: Vec<String>,
}

fn faq(root: &Path) -> Result<Vec<Item>, String> {
    let f: FaqFile = serde_json::from_str(&read(root, "benchmark/field/faq_questions.json")?).map_err(|e| e.to_string())?;
    let item = |q: String, gold: &[String], group| Item { q, gold: gold.iter().cloned().collect(), group };
    let mut out = Vec::new();
    for r in &f.items {
        match (r.student, r.gold_kb_ids.is_empty()) {
            (true, false) => out.extend([
                item(r.th.clone(), &r.gold_kb_ids, Group::FaqTh),
                item(short(&r.th), &r.gold_kb_ids, Group::FaqShort),
                item(typo(&r.th), &r.gold_kb_ids, Group::FaqTypo),
                item(r.en.clone(), &r.gold_kb_ids, Group::FaqEn),
            ]),
            (true, true) => out.extend([item(r.th.clone(), &[], Group::UncoveredTh), item(r.en.clone(), &[], Group::UncoveredEn)]),
            (false, _) => out.extend([item(r.th.clone(), &[], Group::StaffTh), item(r.en.clone(), &[], Group::StaffEn)]),
        }
    }
    Ok(out)
}

#[derive(Deserialize)]
struct SynthFile {
    items: Vec<SynthItem>,
}
#[derive(Deserialize)]
struct SynthItem {
    q: String,
    kind: String,
    gold: Vec<String>,
}

/// Generated questions (labels unreviewed). A near-miss should not be answered, whatever its `gold` says.
fn synth(root: &Path) -> Result<Vec<Item>, String> {
    let f: SynthFile = serde_json::from_str(&read(root, "benchmark/synth/questions_001.json")?).map_err(|e| e.to_string())?;
    Ok(f.items
        .into_iter()
        .filter_map(|s| {
            let group = match s.kind.as_str() {
                "para_th" => Group::SynthParaTh,
                "para_en" => Group::SynthParaEn,
                "near_miss" => Group::SynthNearMiss,
                _ => return None,
            };
            let gold = match group {
                Group::SynthNearMiss => HashSet::new(),
                _ => s.gold.into_iter().collect(),
            };
            Some(Item { q: s.q, gold, group })
        })
        .collect())
}

/// The 424 reviewed questions of abstain experiment 001.
pub fn reviewed(root: &Path, ids: &HashSet<String>) -> Result<Vec<Item>, String> {
    let mut items = eval52(root, ids)?;
    items.extend(faq(root)?);
    Ok(items)
}

pub fn generated(root: &Path) -> Result<Vec<Item>, String> {
    synth(root)
}
