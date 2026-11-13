//! Plan 019 step 1.1: how often the top two search scores tie at >= 4 (the low-gate "act at once" band of `decide_tier`, which never looks
//! at the second score), and what the tie answers today. No engine change; it measures what a tie rule would win and lose.
//!   cargo run -q --release -p reflex-bench --bin tie_census            # print
//!   cargo run -q --release -p reflex-bench --bin tie_census -- --write # also write benchmark/tie/NNN_<date>_tie_census.md
//! Sets: the reviewed Graduate School questions (gold ids), the generated ones (labels NOT reviewed), the College of Music questions
//! (packs/music-college/expected.json, built with `new_agency.mjs --draft`), and the questions of benchmark/golden/route.json (no labels:
//! only how many sit in each band, i.e. how many recorded rows a rule could move).
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::Path;
use std::process::Command;

use reflex_bench::data::{generated, manual, repo_root, reviewed};
use reflex_bench::numbering::{next_number, today};
use reflex_bench::score::GATE;
use reflex_bench::types::Item;
use reflex_wasm::decide::{decide_tier, Action};
use reflex_wasm::{kb_rank, KbEntryIn, KbHit};
use serde::Deserialize;

/// The score from which `decide_tier` acts at once on a low gate.
const REFLEX_BAR: i32 = 4;
/// Cosine margins tried as a tie-break: act on the cosine-first entry of a tie only when it leads the second by at least this much.
const MARGINS: [f32; 5] = [0.005, 0.01, 0.02, 0.05, 0.10];

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum Band {
    Tie,
    LeadOne,
    LeadTwoPlus,
}

impl Band {
    fn of(ranked: &[KbHit]) -> Option<Band> {
        let top = ranked.first().filter(|h| h.s >= REFLEX_BAR)?;
        Some(match ranked.get(1).map(|h| top.s - h.s) {
            Some(0) => Band::Tie,
            Some(1) => Band::LeadOne,
            _ => Band::LeadTwoPlus,
        })
    }
    fn label(self) -> &'static str {
        match self {
            Band::Tie => "tie (top two equal)",
            Band::LeadOne => "lead 1",
            Band::LeadTwoPlus => "lead >= 2 or only one hit",
        }
    }
}

/// One labelled question in the reflex band, as the shipped search ranked it.
struct Case {
    band: Band,
    /// the question has a right entry (`false`: nothing should be answered)
    positive: bool,
    /// rank (0-based) of the first gold entry among the top three
    gold_at: Option<usize>,
    /// the top score is shared by three or more entries
    three_way: bool,
    /// cosine lead of the first over the second entry
    cos_lead: f32,
    q: String,
    top_id: String,
    second_id: String,
}

fn cases(kb: &[KbEntryIn], items: &[Item]) -> Vec<Case> {
    items
        .iter()
        .filter_map(|it| {
            let ranked = kb_rank(kb, &it.q);
            let band = Band::of(&ranked)?;
            let scores: Vec<f64> = ranked.iter().map(|h| f64::from(h.s)).collect();
            // only the questions the shipped rule answers from the manual: those are the ones a tie rule can change
            (decide_tier(Some(GATE), &scores).action == Action::Act).then_some(())?;
            let top = &ranked[0];
            Some(Case {
                band,
                positive: !it.gold.is_empty(),
                gold_at: ranked.iter().take(3).position(|h| it.gold.contains(&h.id)),
                three_way: ranked.get(2).is_some_and(|h| h.s == top.s),
                cos_lead: ranked.get(1).map_or(1.0, |h| top.cos - h.cos),
                q: it.q.clone(),
                top_id: top.id.clone(),
                second_id: ranked.get(1).map_or_else(String::new, |h| h.id.clone()),
            })
        })
        .collect()
}

/// Per band: answered, right first, wrong first with the right entry offered in the top 2 / 3, nothing-should-answer, three-way ties.
fn band_table(out: &mut String, title: &str, cs: &[Case]) {
    let _ = writeln!(out, "\n### {title}\n");
    let _ = writeln!(out, "| band (top score >= {REFLEX_BAR}, answered today) | answered | right entry first | wrong first, right in top 2 | wrong first, right only 3rd | right not in top 3 | should not answer | three-way tie |");
    let _ = writeln!(out, "|---|---|---|---|---|---|---|---|");
    for band in [Band::Tie, Band::LeadOne, Band::LeadTwoPlus] {
        let b: Vec<&Case> = cs.iter().filter(|c| c.band == band).collect();
        let pos = b.iter().filter(|c| c.positive);
        let at = |k: usize| pos.clone().filter(|c| c.gold_at == Some(k)).count();
        let miss = pos.clone().filter(|c| c.gold_at.is_none()).count();
        let neg = b.iter().filter(|c| !c.positive).count();
        let three = b.iter().filter(|c| c.three_way).count();
        let _ = writeln!(out, "| {} | {} | {} | {} | {} | {miss} | {neg} | {three} |", band.label(), b.len(), at(0), at(1), at(2));
    }
}

/// A tie rule on the tie band: "ask (offer the top 3)" for every tie, or only when the cosine lead is under a margin.
/// lost = a right direct answer becomes a question; fixed = a wrong direct answer becomes a question that offers the right entry;
/// still wrong = a wrong direct answer stays (lead over the margin); asked, right absent = a wrong answer becomes an offer without it.
fn rule_table(out: &mut String, cs: &[Case]) {
    let ties: Vec<&Case> = cs.iter().filter(|c| c.band == Band::Tie).collect();
    let _ = writeln!(out, "\n| rule on a tie | right answers lost to a question | wrong answers fixed (right entry offered) | wrong answers turned into an offer without the right entry | should-not-answer turned into an offer | wrong answers kept |");
    let _ = writeln!(out, "|---|---|---|---|---|---|");
    let rows = std::iter::once(("ask on every tie".to_string(), 0.0_f32)).chain(MARGINS.iter().map(|m| (format!("ask when cosine lead < {m}"), *m)));
    for (name, margin) in rows {
        let ask = |c: &&&Case| margin == 0.0 || c.cos_lead < margin;
        let (asked, kept): (Vec<&&Case>, Vec<&&Case>) = ties.iter().partition(ask);
        let lost = asked.iter().filter(|c| c.gold_at == Some(0)).count();
        let fixed = asked.iter().filter(|c| c.positive && matches!(c.gold_at, Some(1 | 2))).count();
        let absent = asked.iter().filter(|c| c.positive && c.gold_at.is_none()).count();
        let neg = asked.iter().filter(|c| !c.positive).count();
        let wrong_kept = kept.iter().filter(|c| c.gold_at != Some(0)).count();
        let _ = writeln!(out, "| {name} | {lost} | {fixed} | {absent} | {neg} | {wrong_kept} |");
    }
}

/// The cosine lead of right vs wrong tie answers (does cosine already separate them?).
fn lead_line(out: &mut String, cs: &[Case]) {
    let leads = |right: bool| {
        let mut v: Vec<f32> = cs.iter().filter(|c| c.band == Band::Tie && (c.gold_at == Some(0)) == right).map(|c| c.cos_lead).collect();
        v.sort_by(f32::total_cmp);
        match v.len() {
            0 => "none".to_string(),
            n => format!("n {n}, min {:.3}, median {:.3}, max {:.3}", v[0], v[n / 2], v[n - 1]),
        }
    };
    let _ = writeln!(out, "\nCosine lead of the first over the second entry on a tie: right answers {}; wrong answers {}.", leads(true), leads(false));
}

fn wrong_ties(out: &mut String, cs: &[Case], limit: usize) {
    let bad: Vec<&Case> = cs.iter().filter(|c| c.band == Band::Tie && c.gold_at != Some(0)).collect();
    match bad.is_empty() {
        true => {}
        false => {
            let _ = writeln!(out, "\nWrong answers on a tie ({} shown of {}): question -> answered / runner-up, cosine lead, where the right entry is.\n", bad.len().min(limit), bad.len());
            for c in bad.iter().take(limit) {
                let at = c.gold_at.map_or_else(|| if c.positive { "not in top 3".into() } else { "nothing should answer".into() }, |k| format!("rank {}", k + 1));
                let _ = writeln!(out, "- `{}` -> {} / {}, {:.3}, {at}", c.q.replace('`', "'"), c.top_id, c.second_id, c.cos_lead);
            }
        }
    }
}

#[derive(Deserialize)]
struct Expected {
    answer: HashMap<String, String>,
    /// a question that fits several entries: any of them is a right top hit
    #[serde(default)]
    pick: HashMap<String, Vec<String>>,
    #[serde(default)]
    known_wrong: HashMap<String, String>,
    none: Vec<String>,
}

#[derive(Deserialize)]
struct PackRow {
    id: String,
    keywords: String,
}

/// The music pack built as a draft into a temp folder, and its labelled questions. `Err` = node or the build failed (reported).
fn music(root: &Path) -> Result<(Vec<KbEntryIn>, Vec<Item>), String> {
    let out = std::env::temp_dir().join(format!("rw-tie-census-{}", std::process::id()));
    let pack = root.join("packs/music-college");
    let run = Command::new("node").arg(root.join("scripts/new_agency.mjs")).arg(&pack).arg(&out).arg("--draft").output().map_err(|e| format!("node: {e}"))?;
    if !run.status.success() {
        return Err(format!("new_agency --draft failed: {}", String::from_utf8_lossy(&run.stderr)));
    }
    let rows: Vec<PackRow> = serde_json::from_str(&std::fs::read_to_string(out.join("knowledge-index.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&out);
    let ex: Expected = serde_json::from_str(&std::fs::read_to_string(pack.join("expected.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let item = |q: String, gold: HashSet<String>| Item { q, gold, group: reflex_bench::types::Group::Eval52 };
    let items = ex.answer.into_iter().chain(ex.known_wrong).map(|(q, id)| item(q, HashSet::from([id]))).chain(ex.pick.into_iter().map(|(q, ids)| item(q, ids.into_iter().collect()))).chain(ex.none.into_iter().map(|q| item(q, HashSet::new()))).collect();
    Ok((rows.into_iter().map(|r| KbEntryIn { id: r.id, keywords: r.keywords }).collect(), items))
}

/// How many recorded route.json questions sit in each band (no labels; the ceiling of golden rows a tie rule could move).
fn golden_bands(root: &Path, kb: &[KbEntryIn]) -> Result<HashMap<Band, usize>, String> {
    let rows: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(root.join("benchmark/golden/route.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut n = HashMap::new();
    for q in rows.iter().filter_map(|r| r["q"].as_str()) {
        if let Some(b) = Band::of(&kb_rank(kb, q)) {
            *n.entry(b).or_insert(0) += 1;
        }
    }
    Ok(n)
}

fn section(out: &mut String, title: &str, cs: &[Case]) {
    band_table(out, title, cs);
    rule_table(out, cs);
    lead_line(out, cs);
    wrong_ties(out, cs, 25);
}

fn main() -> Result<(), String> {
    let write = std::env::args().any(|a| a == "--write");
    let root = repo_root();
    let kb = manual(&root)?;
    let ids: HashSet<String> = kb.iter().map(|e| e.id.clone()).collect();
    let rev = cases(&kb, &reviewed(&root, &ids)?);
    let gen = cases(&kb, &generated(&root)?);
    let dir = root.join("benchmark/tie");
    let (num, date) = (next_number(&dir), today());

    let mut out = String::new();
    let _ = writeln!(out, "# Tie {num:03} - ties at the top score in the low-gate band ({date})\n");
    let _ = writeln!(out, "Plan 019 step 1.1. Run: `cargo run -q --release -p reflex-bench --bin tie_census -- --write`. Search and tier rule: the native twin of the shipped wasm (`kb_rank`, `decide_tier`, gate {GATE}). Only questions the shipped rule answers with a top score >= {REFLEX_BAR} are counted. Ranks within a tie are the search's own order (cosine, then overlap).");
    let _ = writeln!(out, "\nNo engine change. The question this answers: would \"a tie at the top -> ask which one\" fix more wrong answers than it turns right answers into questions?");
    section(&mut out, "Graduate School, reviewed questions (eval52 + official FAQ variants + not-in-manual + staff-only)", &rev);
    section(&mut out, "Graduate School, generated questions (labels NOT reviewed)", &gen);
    match music(&root) {
        Ok((mkb, items)) => section(&mut out, "College of Music draft pack (packs/music-college/expected.json)", &cases(&mkb, &items)),
        Err(e) => {
            let _ = writeln!(out, "\n### College of Music\n\nNot measured: {e}");
        }
    }
    let gb = golden_bands(&root, &kb)?;
    let _ = writeln!(out, "\n### benchmark/golden/route.json (no labels, raw question text, before the page's rewrites)\n");
    let _ = writeln!(out, "Questions with a top score >= {REFLEX_BAR}: tie {}, lead 1 {}, lead >= 2 {}. A rule on ties can move at most the tie rows (fewer: many take an earlier branch).", gb.get(&Band::Tie).unwrap_or(&0), gb.get(&Band::LeadOne).unwrap_or(&0), gb.get(&Band::LeadTwoPlus).unwrap_or(&0));
    print!("{out}");
    if write {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{num:03}_{date}_tie_census.md"));
        std::fs::write(&path, &out).map_err(|e| e.to_string())?;
        eprintln!("wrote {}", path.display());
    }
    Ok(())
}
