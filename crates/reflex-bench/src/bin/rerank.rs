//! Plan 016 item 11 / plan 010 A (katgpt draft-then-verify): re-rank only the trigram search's top-K with cos_lex + w * cos_distilled.
//!   cargo run -q --release -p reflex-bench --bin rerank -- [--cache /tmp/rw_embed_bge_m3.json] [--write]
//! Labels of the paraphrase / near-miss sets are generated and NOT reviewed.
use std::collections::HashMap;
use std::fmt::Write as _;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use reflex_bench::data::repo_root;
use reflex_bench::distill::linalg::{project, projection};
use reflex_bench::distill::map::{grams, DistilledMap, Grams};
use reflex_bench::distill::sets::{load, Cache, Q};
use reflex_bench::numbering::{next_number, today};
use reflex_bench::retention::{GateVerdict, Retention};
use reflex_bench::score::GATE;
use reflex_wasm::decide::{decide_tier, Action};
use reflex_wasm::{kb_rank, KbEntryIn, KbHit};

const LAMBDA: f64 = 0.1;
const KS: [usize; 3] = [3, 5, 10];
const WS: [f64; 7] = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
const FOLDS: usize = 5;
const SIZE_BUDGET: usize = 500 * 1024;

#[derive(Clone, Copy, PartialEq)]
enum Arm {
    Shipped,
    Distilled,
    Hybrid,
    Rerank(usize, f64),
}

impl Arm {
    fn name(self) -> String {
        match self {
            Arm::Shipped => "A shipped (trigram search)".into(),
            Arm::Distilled => "B distilled only".into(),
            Arm::Hybrid => "D hybrid (A if score >= 4 else B)".into(),
            Arm::Rerank(k, _) => format!("R re-rank top-{k}"),
        }
    }
}

/// One question, scored once: the search's ranked list and the distilled cosine to every entry.
struct Scored {
    ranked: Vec<KbHit>,
    dist: Vec<f64>,
}

fn top(arm: Arm, s: &Scored, idx: &HashMap<String, usize>, ids: &[String]) -> Option<String> {
    let best_dist = || s.dist.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1)).map(|(i, _)| ids[i].clone());
    match arm {
        Arm::Shipped => s.ranked.first().map(|h| h.id.clone()),
        Arm::Distilled => best_dist(),
        Arm::Hybrid => match s.ranked.first() {
            Some(h) if h.s >= 4 => Some(h.id.clone()),
            _ => best_dist(),
        },
        Arm::Rerank(k, w) => s
            .ranked
            .iter()
            .take(k)
            .max_by(|a, b| {
                let f = |h: &KbHit| f64::from(h.cos) + w * idx.get(&h.id).map_or(0.0, |&i| s.dist[i]);
                f(a).total_cmp(&f(b))
            })
            .map(|h| h.id.clone()),
    }
}

fn right(arm: Arm, s: &Scored, q: &Q, idx: &HashMap<String, usize>, ids: &[String]) -> bool {
    top(arm, s, idx, ids).is_some_and(|t| q.gold.contains(&t))
}

fn pct(a: usize, b: usize) -> String {
    format!("{:.1} %", 100.0 * a as f64 / b.max(1) as f64)
}

/// gzip -9 size, through a temp file (a piped stdin + stdout would deadlock once the output passes the pipe buffer).
fn gzip_len(bytes: &[u8]) -> Result<usize, String> {
    let path = std::env::temp_dir().join(format!("rw_rerank_table_{}.bin", std::process::id()));
    std::fs::File::create(&path).and_then(|mut f| f.write_all(bytes)).map_err(|e| e.to_string())?;
    let out = Command::new("gzip").arg("-9c").arg(&path).stdout(Stdio::piped()).output().map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(out.stdout.len())
}

struct Config {
    label: &'static str,
    map: DistilledMap,
    entries: Vec<Vec<f64>>,
    size_gz: usize,
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let write = args.iter().any(|a| a == "--write");
    let cache_path = args.iter().position(|a| a == "--cache").and_then(|i| args.get(i + 1)).map_or_else(|| PathBuf::from("/tmp/rw_embed_bge_m3.json"), PathBuf::from);
    let root = repo_root();
    let sets = load(&root)?;
    let cache = Cache::open(&cache_path)?;
    let kb: Vec<KbEntryIn> = sets.entries.iter().map(|e| KbEntryIn { id: e.id.clone(), keywords: e.keywords.clone() }).collect();
    let ids: Vec<String> = sets.entries.iter().map(|e| e.id.clone()).collect();
    let idx: HashMap<String, usize> = ids.iter().enumerate().map(|(i, id)| (id.clone(), i)).collect();
    let train_grams: Vec<Grams> = sets.train.iter().map(|(t, _)| grams(t)).collect();
    let train_targets: Vec<Vec<f64>> = sets.train.iter().map(|(t, _)| cache.get(t).cloned()).collect::<Result<_, _>>()?;
    let entry_vecs: Vec<Vec<f64>> = sets.entries.iter().map(|e| cache.get(&reflex_bench::distill::sets::doc_text(e)).cloned()).collect::<Result<_, _>>()?;

    // two maps: the full 1024-d one (quality reference, as experiment 005) and the shippable one (128-d projection, int8 rows)
    let r = projection(1024, 128, 20_261_110);
    let full = DistilledMap::fit(train_grams.clone(), &train_targets, LAMBDA)?;
    let full_size = gzip_len(&full.artifact(&entry_vecs))?;
    let small_targets: Vec<Vec<f64>> = train_targets.iter().map(|v| project(v, &r, 128)).collect();
    let small_entries: Vec<Vec<f64>> = entry_vecs.iter().map(|v| project(v, &r, 128)).collect();
    let small = DistilledMap::fit(train_grams, &small_targets, LAMBDA)?.quantised();
    let small_size = gzip_len(&small.artifact(&small_entries))?;
    let configs = [
        Config { label: "1024-d f64 (reference)", map: full, entries: entry_vecs, size_gz: full_size },
        Config { label: "128-d projection, int8 (shippable)", map: small, entries: small_entries, size_gz: small_size },
    ];

    let mut out = String::new();
    let date = today();
    let num = next_number(&root.join("benchmark/synth"));
    let _ = writeln!(out, "# {num:03} Draft then verify: re-rank the trigram top-K with the distilled map ({date}, labels unreviewed)\n");
    let _ = writeln!(out, "Plan 016 item 11, plan 010 Second look A (katgpt-rs `dd_tree/tree_builder.rs`: the verifier only scores drafted candidates). Run: `cargo run -q --release -p reflex-bench --bin rerank -- --write` (needs the bge-m3 cache from `node benchmark/synth/embed.mjs --model bge-m3`).");
    let _ = writeln!(out, "Map: kernel ridge (lambda {LAMBDA}) from the shipped trigram set (`reflex_wasm::gram_set`) to bge-m3, trained on the {} items of experiment 005 (entry texts + Thai paraphrases 0, 2 + English 0). Re-rank: among the search's top-K, highest cos_lex + w * cos_distilled; w from {{{}}} chosen by {FOLDS}-fold CV on the Thai + English held-out paraphrases (the fold being scored is never used to choose w); eval52 / FAQ / near-misses use the w chosen on all paraphrases.\n", sets.train.len(), WS.map(|w| w.to_string()).join(", "));
    let _ = writeln!(out, "**Preregistered gate (plan 010 A, written before this run):** Thai held-out first-right >= shipped + 10 points; English held-out, eval52 and FAQ not below shipped; near-misses answered with their own source entry <= 22.0 %; map <= 500 KB gzip; and (item 5) retained >= 0.95 of shipped's right answers on eval52 + FAQ with a net gain.\n");

    let mut verdict_lines = Vec::new();
    for cfg in &configs {
        let score = |q: &str| Scored { ranked: kb_rank(&kb, q), dist: cfg.map.scores(&grams(q), &cfg.entries) };
        let pool: Vec<(&Q, Scored)> = sets.th_heldout.iter().chain(&sets.en_heldout).map(|q| (q, score(&q.q))).collect();
        let n_th = sets.th_heldout.len();
        let others: Vec<(&str, Vec<(&Q, Scored)>)> = [("eval52", &sets.eval52), ("FAQ Thai", &sets.faq_th)].into_iter().map(|(n, s)| (n, s.iter().map(|q| (q, score(&q.q))).collect())).collect();
        let near: Vec<(String, Scored)> = sets.near_miss.iter().map(|(q, src)| (src.clone(), score(q))).collect();
        let best_w = |k: usize, rows: &[&(&Q, Scored)]| WS.into_iter().max_by_key(|&w| rows.iter().filter(|(q, s)| right(Arm::Rerank(k, w), s, q, &idx, &ids)).count()).unwrap_or(1.0);
        let _ = writeln!(out, "\n## {} (table {} KB gzip)\n", cfg.label, cfg.size_gz / 1024);
        let _ = writeln!(out, "| arm | w (all paraphrases) | Thai held-out ({n_th}) | English held-out ({}) | eval52 ({}) | FAQ Thai ({}) | near-miss answered with its source ({}) | retained on eval52+FAQ | gate |", sets.en_heldout.len(), others[0].1.len(), others[1].1.len(), near.len());
        let _ = writeln!(out, "|---|---|---|---|---|---|---|---|---|");
        let shipped_of = |rows: &[(&Q, Scored)]| -> Vec<bool> { rows.iter().map(|(q, s)| right(Arm::Shipped, s, q, &idx, &ids)).collect() };
        let base_th = shipped_of(&pool[..n_th]).iter().filter(|x| **x).count();
        let base_en = shipped_of(&pool[n_th..]).iter().filter(|x| **x).count();
        let base_o: Vec<usize> = others.iter().map(|(_, rows)| shipped_of(rows).iter().filter(|x| **x).count()).collect();
        let arms: Vec<Arm> = [Arm::Shipped, Arm::Distilled, Arm::Hybrid].into_iter().chain(KS.iter().map(|&k| Arm::Rerank(k, 0.0))).collect();
        for arm in arms {
            // CV: for a re-rank arm, each fold is scored with the w chosen on the other folds
            let pool_right: Vec<bool> = match arm {
                Arm::Rerank(k, _) => (0..pool.len())
                    .map(|i| {
                        let train: Vec<&(&Q, Scored)> = pool.iter().enumerate().filter(|(j, _)| j % FOLDS != i % FOLDS).map(|(_, r)| r).collect();
                        let (q, s) = &pool[i];
                        right(Arm::Rerank(k, best_w(k, &train)), s, q, &idx, &ids)
                    })
                    .collect(),
                _ => pool.iter().map(|(q, s)| right(arm, s, q, &idx, &ids)).collect(),
            };
            let arm_all = match arm {
                Arm::Rerank(k, _) => Arm::Rerank(k, best_w(k, &pool.iter().collect::<Vec<_>>())),
                a => a,
            };
            let th = pool_right[..n_th].iter().filter(|x| **x).count();
            let en = pool_right[n_th..].iter().filter(|x| **x).count();
            let o: Vec<usize> = others.iter().map(|(_, rows)| rows.iter().filter(|(q, s)| right(arm_all, s, q, &idx, &ids)).count()).collect();
            let nm = near.iter().filter(|(src, s)| {
                let scores: Vec<f64> = s.ranked.iter().map(|h| f64::from(h.s)).collect();
                decide_tier(Some(GATE), &scores).action == Action::Act && top(arm_all, s, &idx, &ids).as_deref() == Some(src.as_str())
            }).count();
            let ship_r: Vec<bool> = others.iter().flat_map(|(_, rows)| shipped_of(rows)).collect();
            let arm_r: Vec<bool> = others.iter().flat_map(|(_, rows)| rows.iter().map(|(q, s)| right(arm_all, s, q, &idx, &ids)).collect::<Vec<_>>()).collect();
            let ret = Retention::of(&ship_r, &arm_r);
            let pass = arm != Arm::Shipped
                && 100.0 * th as f64 / n_th as f64 >= 100.0 * base_th as f64 / n_th as f64 + 10.0
                && en >= base_en
                && o.iter().zip(&base_o).all(|(a, b)| a >= b)
                && 100.0 * nm as f64 / near.len() as f64 <= 22.0
                && cfg.size_gz <= SIZE_BUDGET
                && ret.verdict(0.95) == GateVerdict::Adopt;
            let w_txt = match arm_all {
                Arm::Rerank(_, w) => w.to_string(),
                _ => "-".into(),
            };
            let gate = match arm {
                Arm::Shipped => "(floor)".to_string(),
                _ if pass => "**PASS**".into(),
                _ => "fail".into(),
            };
            let _ = writeln!(out, "| {} | {w_txt} | {} | {} | {} | {} | {} | {:.3} (lost {}, gained {}) | {gate} |", arm.name(), pct(th, n_th), pct(en, pool.len() - n_th), pct(o[0], others[0].1.len()), pct(o[1], others[1].1.len()), pct(nm, near.len()), ret.retained(), ret.lost, ret.gained);
            if pass {
                verdict_lines.push(format!("{} / {}: Thai {} (shipped {})", cfg.label, arm.name(), pct(th, n_th), pct(base_th, n_th)));
            }
        }
    }
    let verdict = match verdict_lines.is_empty() {
        true => "no arm passes the preregistered gate; nothing ships. See the tables for which condition each arm misses.".to_string(),
        false => format!("PASS: {}. Ship only after a fresh, reviewed paraphrase set confirms it (these labels are generated).", verdict_lines.join("; ")),
    };
    let body = out;
    let mut out = String::new();
    let mut lines = body.lines();
    let title = lines.next().unwrap_or_default();
    let _ = writeln!(out, "{title}\n\n**Verdict:** {verdict}");
    for l in lines {
        let _ = writeln!(out, "{l}");
    }
    let _ = writeln!(out, "\n## Reading\n- \"Near-miss answered with its source\": the shipped tier rule answers (`act`, lexical scores) and the arm's top entry is the near-miss's source entry (the generated near-miss asks something that entry does not say).\n- Same train / held-out split as experiment 005; English has one training example per entry. Not a fresh question set: plan 010 item 3 still asks for one before anything ships.");
    print!("{out}");
    if write {
        let path = root.join(format!("benchmark/synth/{num:03}_rerank_unreviewed.md"));
        std::fs::write(&path, &out).map_err(|e| e.to_string())?;
        eprintln!("wrote {}", path.display());
    }
    Ok(())
}
