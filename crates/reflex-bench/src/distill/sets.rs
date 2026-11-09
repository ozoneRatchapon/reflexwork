//! The question sets of benchmark/synth/distill.mjs, plus near-misses with their source entry, and the bge-m3 cache it reads.
use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::data::reviewed;
use crate::types::Group;

#[derive(Deserialize, Clone)]
pub struct Entry {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub answer: String,
    pub keywords: String,
}

/// distill.mjs `docText`: title + the first 400 characters of the answer.
pub fn doc_text(e: &Entry) -> String {
    format!("{}\n{}", e.title, e.answer.chars().take(400).collect::<String>())
}

#[derive(Deserialize)]
struct SynthFile {
    items: Vec<SynthItem>,
}
#[derive(Deserialize, Clone)]
struct SynthItem {
    q: String,
    kind: String,
    source_id: String,
}

pub struct Q {
    pub q: String,
    pub gold: HashSet<String>,
}

pub struct Sets {
    pub entries: Vec<Entry>,
    /// (text, entry id) for the map: entry texts + Thai paraphrases 0, 2 + English paraphrase 0 of each entry
    pub train: Vec<(String, String)>,
    pub th_heldout: Vec<Q>,
    pub en_heldout: Vec<Q>,
    pub eval52: Vec<Q>,
    pub faq_th: Vec<Q>,
    /// (question, its source entry): should not be answered with that entry
    pub near_miss: Vec<(String, String)>,
}

pub fn load(root: &Path) -> Result<Sets, String> {
    let read = |rel: &str| std::fs::read_to_string(root.join(rel)).map_err(|e| format!("{rel}: {e}"));
    let entries: Vec<Entry> = serde_json::from_str(&read("submissions/ui/knowledge-index.json")?).map_err(|e| e.to_string())?;
    let ids: HashSet<String> = entries.iter().map(|e| e.id.clone()).collect();
    let synth: SynthFile = serde_json::from_str(&read("benchmark/synth/questions_001.json")?).map_err(|e| e.to_string())?;
    let items: Vec<SynthItem> = synth.items.into_iter().filter(|x| !x.q.is_empty() && ids.contains(&x.source_id)).collect();
    let by = |kind: &str| {
        let mut m: Vec<(String, Vec<SynthItem>)> = Vec::new();
        for x in items.iter().filter(|x| x.kind == kind) {
            match m.iter_mut().find(|(k, _)| *k == x.source_id) {
                Some((_, v)) => v.push(x.clone()),
                None => m.push((x.source_id.clone(), vec![x.clone()])),
            }
        }
        m
    };
    let (th, en) = (by("para_th"), by("para_en"));
    let one = |x: &SynthItem| Q { q: x.q.clone(), gold: HashSet::from([x.source_id.clone()]) };
    let mut train: Vec<(String, String)> = entries.iter().map(|e| (doc_text(e), e.id.clone())).collect();
    train.extend(th.iter().flat_map(|(_, v)| v.iter().step_by(2)).map(|x| (x.q.clone(), x.source_id.clone())));
    train.extend(en.iter().filter_map(|(_, v)| v.first()).map(|x| (x.q.clone(), x.source_id.clone())));
    let rev = reviewed(root, &ids)?;
    let pick = |g: Group| rev.iter().filter(|i| i.group == g && !i.gold.is_empty()).map(|i| Q { q: i.q.clone(), gold: i.gold.clone() }).collect();
    Ok(Sets {
        train,
        th_heldout: th.iter().flat_map(|(_, v)| v.iter().skip(1).step_by(2)).map(one).collect(),
        en_heldout: en.iter().flat_map(|(_, v)| v.iter().skip(1)).map(one).collect(),
        eval52: pick(Group::Eval52),
        faq_th: pick(Group::FaqTh),
        near_miss: items.iter().filter(|x| x.kind == "near_miss").map(|x| (x.q.clone(), x.source_id.clone())).collect(),
        entries,
    })
}

/// The bge-m3 vectors written by benchmark/synth/embed.mjs (key: first 20 hex of sha256(text)).
pub struct Cache(HashMap<String, Vec<f64>>);

impl Cache {
    pub fn open(path: &Path) -> Result<Cache, String> {
        let raw = std::fs::read_to_string(path).map_err(|e| format!("{}: {e} (run: node benchmark/synth/embed.mjs --model bge-m3)", path.display()))?;
        Ok(Cache(serde_json::from_str(&raw).map_err(|e| e.to_string())?))
    }
    pub fn get(&self, text: &str) -> Result<&Vec<f64>, String> {
        let h = Sha256::digest(text.as_bytes());
        let key: String = h.iter().take(10).map(|b| format!("{b:02x}")).collect();
        self.0.get(&key).ok_or_else(|| format!("not in the bge-m3 cache: {}", text.chars().take(40).collect::<String>()))
    }
}
