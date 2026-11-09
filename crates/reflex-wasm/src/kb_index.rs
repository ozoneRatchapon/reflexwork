//! The TF-IDF index behind `kb_rank`, built once per manual.
//! `kb_rank(entries, q)` = `KbIndex::new(entries).rank(q)`, so a caller that searches the same manual many times (`route::Manual`:
//! up to 2 searches per decision plus one per AI search phrase) pays the index build once instead of on every search.
//! Measured 2026-11-10 (plan 009 C4, `benchmark/coldstart/router_cost.mjs`): rebuilding it per search cost 7-9 ms per KB decision in V8.
use std::collections::HashMap;

use crate::{cos_to_score, gram_set, strip_query_fillers, KbEntryIn, KbHit};

#[derive(Clone, Debug, Default)]
pub struct KbIndex {
    ids: Vec<String>,
    /// lowercased keywords (the lexical overlap test)
    keywords_lower: Vec<String>,
    /// unit-length tf-idf vector per entry
    doc_vecs: Vec<HashMap<String, f32>>,
    /// document frequency per gram
    df: HashMap<String, f32>,
    /// number of entries (at least 1)
    n: f32,
}

impl KbIndex {
    pub fn new(entries: &[KbEntryIn]) -> Self {
        let n = entries.len().max(1) as f32;
        let doc_grams: Vec<Vec<String>> = entries.iter().map(|e| gram_set(&e.keywords)).collect();
        let mut df: HashMap<String, f32> = HashMap::new();
        for g in doc_grams.iter().flatten() {
            *df.entry(g.clone()).or_insert(0.0) += 1.0;
        }
        let mut index = KbIndex { ids: entries.iter().map(|e| e.id.clone()).collect(), keywords_lower: entries.iter().map(|e| e.keywords.to_lowercase()).collect(), doc_vecs: Vec::new(), df, n };
        index.doc_vecs = doc_grams.iter().map(|gs| index.unit_vec(gs)).collect();
        index
    }

    pub fn len(&self) -> usize {
        self.ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    fn idf(&self, g: &str) -> f32 {
        ((self.n + 1.0) / (self.df.get(g).copied().unwrap_or(0.0) + 1.0)).ln() + 1.0
    }

    /// normalized tf-idf vector of a gram set
    fn unit_vec(&self, gs: &[String]) -> HashMap<String, f32> {
        let mut v = HashMap::with_capacity(gs.len());
        let mut n2 = 0.0f32;
        for g in gs {
            let w = self.idf(g);
            v.insert(g.clone(), w);
            n2 += w * w;
        }
        let nr = n2.sqrt().max(1e-9);
        for w in v.values_mut() {
            *w /= nr;
        }
        v
    }

    /// Ranked hits by cosine (then overlap), each with the position of its entry in the indexed list.
    pub fn rank_at(&self, query: &str) -> Vec<(usize, KbHit)> {
        let qgrams = gram_set(&strip_query_fillers(query));
        let qv = self.unit_vec(&qgrams);
        let mut scored: Vec<(usize, KbHit)> = Vec::new();
        for (i, (kw, dv)) in self.keywords_lower.iter().zip(&self.doc_vecs).enumerate() {
            let overlap = qgrams.iter().filter(|g| kw.contains(g.as_str())).count() as i32;
            let cos: f32 = qv.iter().filter_map(|(g, w)| dv.get(g).map(|dw| w * dw)).sum();
            if overlap > 0 || cos > 0.0 {
                scored.push((i, KbHit { id: self.ids[i].clone(), s: 0, cos, overlap }));
            }
        }
        // rank by cosine (primary), overlap (tiebreak); stable, so equal rows keep the entry order
        scored.sort_by(|(_, a), (_, b)| b.cos.partial_cmp(&a.cos).unwrap_or(std::cmp::Ordering::Equal).then(b.overlap.cmp(&a.overlap)));
        // the gate score from cosine + margin to the runner-up
        let (runner, runner_overlap) = scored.get(1).map(|(_, h)| (h.cos, h.overlap)).unwrap_or((0.0, 0));
        for (i, (_, h)) in scored.iter_mut().enumerate() {
            let (margin, ov_lead) = match i {
                0 => (h.cos - runner, h.overlap - runner_overlap),
                _ => (0.0, 0),
            };
            h.s = cos_to_score(h.cos, margin, h.overlap, ov_lead);
        }
        scored
    }

    pub fn rank(&self, query: &str) -> Vec<KbHit> {
        self.rank_at(query).into_iter().map(|(_, h)| h).collect()
    }
}
