//! Plan 016 item 12 / plan 010 C (katgpt `pick_latch.rs`): before building a follow-up latch, measure how often the SHIPPED decision
//! order answers a follow-up about the wrong programme, on scripted dialogues (the programme in focus carried turn to turn, as in the page).
//!   cargo run -q --release -p reflex-bench --bin followup -- [--write]
//! The dialogues come from 6 templates x 6 programme pairs; the expected programme per turn is the author's reading (unreviewed).
use std::fmt::Write as _;

use reflex_bench::data::repo_root;
use reflex_bench::numbering::{next_number, today};
use reflex_wasm::resolve::{Catalogue, Programme};
use reflex_wasm::route::{decide_route, Config, Ctx, Manual, ManualEntry, ProgState, Route};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const TODAY: &str = "2026-11-10";

#[derive(Serialize)]
struct Turn {
    q: String,
    /// the programme a person would mean (None: no programme)
    expect: Option<String>,
}

#[derive(Serialize)]
struct Dialogue {
    template: &'static str,
    turns: Vec<Turn>,
}

#[derive(Deserialize)]
struct Row {
    id: String,
    title: String,
    #[serde(default)]
    keywords: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    answer: String,
    #[serde(default)]
    academic_year: Option<String>,
    #[serde(default)]
    semester: Option<String>,
}

fn load() -> Result<(Manual, Catalogue, Vec<Programme>), String> {
    let root = repo_root();
    let read = |rel: &str| std::fs::read_to_string(root.join(rel)).map_err(|e| format!("{rel}: {e}"));
    let rows: Vec<Row> = serde_json::from_str(&read("submissions/ui/knowledge-index.json")?).map_err(|e| e.to_string())?;
    let manual = Manual::new(rows.into_iter().map(|e| ManualEntry { id: e.id, title: e.title, keywords: e.keywords, staff: false, category: e.category, answer: e.answer, academic_year: e.academic_year, semester: e.semester }).collect());
    let doc: Value = serde_json::from_str(&read("submissions/ui/programmes.json")?).map_err(|e| e.to_string())?;
    let progs: Vec<Programme> = doc["programmes"]
        .as_array()
        .ok_or("programmes.json: no programmes")?
        .iter()
        .filter(|p| p["code"].as_str().is_some_and(|c| !c.is_empty()) && p["title"].as_str().is_some_and(|t| !t.trim().is_empty()))
        .filter_map(|p| serde_json::from_value(p.clone()).ok())
        .collect();
    Ok((manual, Catalogue::new(&progs), progs))
}

fn fresh<'a>(manual: &'a Manual, cat: &'a Catalogue) -> Ctx<'a> {
    Ctx { pinned: false, prog_state: ProgState::Ok, ai_off: true, pinned_entry: None, programme_in_focus: None, today: TODAY.into(), catalogue: Some(cat), manual, config: Config::default() }
}

/// The programme a turn's answer is about: a card names its programme, a follow-up uses the one in focus; any other route is about none.
fn used(route: Option<Route>, ctx: &Ctx) -> Option<String> {
    match route {
        Some(Route::ProgrammeCard) | Some(Route::Followup) => ctx.programme_in_focus.clone(),
        _ => None,
    }
}

fn dialogues(pairs: &[(String, String, String, String)]) -> Vec<Dialogue> {
    let t = |q: &str, e: Option<&String>| Turn { q: q.to_string(), expect: e.cloned() };
    pairs
        .iter()
        .flat_map(|(a_code, a_title, b_code, b_title)| {
            let (a, b) = (Some(a_code), Some(b_code));
            [
                Dialogue { template: "follow-ups", turns: vec![t(a_title, a), t("แล้วค่าเทอมล่ะ", a), t("มีทุนไหม", a), t("สมัครได้ถึงเมื่อไหร่", a)] },
                Dialogue { template: "switch", turns: vec![t(a_title, a), t(b_title, b), t("ค่าเทอมเท่าไร", b), t("แล้วทุนล่ะ", b)] },
                Dialogue { template: "manual aside", turns: vec![t(a_title, a), t("ลาพักการศึกษาต้องทำอย่างไร", None), t("แล้วค่าเทอมล่ะ", a)] },
                Dialogue { template: "thanks aside", turns: vec![t(a_title, a), t("ขอบคุณครับ", None), t("มีทุนไหม", a)] },
                Dialogue { template: "restart", turns: vec![t(a_title, a), t("เริ่มใหม่", None), t("ค่าเทอมเท่าไร", None)] },
                Dialogue { template: "switch back", turns: vec![t(a_title, a), t(b_title, b), t(a_title, a), t("แล้วค่าเทอมล่ะ", a)] },
            ]
        })
        .collect()
}

fn main() -> Result<(), String> {
    let write = std::env::args().any(|a| a == "--write");
    let (manual, cat, progs) = load()?;
    // programmes whose title alone opens their card (so a dialogue can start from it), spread over the catalogue
    let cards: Vec<(String, String)> = progs
        .iter()
        .filter_map(|p| {
            let mut ctx = fresh(&manual, &cat);
            (decide_route(&p.title, &mut ctx, None) == Some(Route::ProgrammeCard) && ctx.programme_in_focus.as_deref() == Some(p.code.as_str())).then(|| (p.code.clone(), p.title.clone()))
        })
        .collect();
    let step = (cards.len() / 12).max(1);
    let picked: Vec<&(String, String)> = cards.iter().step_by(step).take(12).collect();
    let pairs: Vec<(String, String, String, String)> = picked.chunks(2).filter(|c| c.len() == 2).map(|c| (c[0].0.clone(), c[0].1.clone(), c[1].0.clone(), c[1].1.clone())).collect();
    let ds = dialogues(&pairs);

    let (mut turns, mut wrong, mut missed, mut about, mut expected_some) = (0usize, 0usize, 0usize, 0usize, 0usize);
    let mut by_template: Vec<(&str, usize, usize, usize)> = Vec::new();
    let mut misses: Vec<String> = Vec::new();
    for d in &ds {
        let mut ctx = fresh(&manual, &cat);
        let (mut w, mut m) = (0, 0);
        for turn in &d.turns {
            let route = decide_route(&turn.q, &mut ctx, None);
            let got = used(route, &ctx);
            turns += 1;
            about += usize::from(got.is_some());
            expected_some += usize::from(turn.expect.is_some());
            let is_wrong = got.is_some() && got != turn.expect;
            let is_missed = turn.expect.is_some() && got.is_none();
            w += usize::from(is_wrong);
            m += usize::from(is_missed);
            if (is_wrong || is_missed) && misses.len() < 12 {
                misses.push(format!("{} | {:?} -> route {:?}, about {:?}, expected {:?}", d.template, turn.q, route.map(|r| r.name()), got, turn.expect));
            }
        }
        wrong += w;
        missed += m;
        match by_template.iter_mut().find(|r| r.0 == d.template) {
            Some(r) => {
                r.1 += d.turns.len();
                r.2 += w;
                r.3 += m;
            }
            None => by_template.push((d.template, d.turns.len(), w, m)),
        }
    }

    // negative control: the same dialogues scored against the OTHER programme of each pair must show wrong answers, or the metric is blind
    let swap = |c: &Option<String>| c.as_ref().and_then(|c| pairs.iter().find_map(|(a, _, b, _)| if c == a { Some(b.clone()) } else if c == b { Some(a.clone()) } else { None }));
    let control_wrong: usize = ds
        .iter()
        .map(|d| {
            let mut ctx = fresh(&manual, &cat);
            d.turns.iter().filter(|turn| { let got = used(decide_route(&turn.q, &mut ctx, None), &ctx); got.is_some() && got != swap(&turn.expect) }).count()
        })
        .sum();
    if control_wrong == 0 {
        return Err("negative control found no wrong answers: the metric cannot see a failure".into());
    }
    let root = repo_root();
    let date = today();
    let num = next_number(&root.join("benchmark/journeys/results"));
    let mut out = String::new();
    let rate = |a: usize, b: usize| format!("{:.1} %", 100.0 * a as f64 / b.max(1) as f64);
    let verdict = match wrong {
        0 => format!("the shipped order never answered about the wrong programme ({wrong} of {about} programme answers); a latch has nothing to halve on these dialogues, so it is NOT built (plan 010 C gate: wrong-programme rate at least halved). Missed follow-ups: {missed} of {expected_some} turns that mean a programme."),
        _ => format!("the shipped order answered about the wrong programme {wrong} times in {about} programme answers ({}); a latch must at least halve that.", rate(wrong, about)),
    };
    let _ = writeln!(out, "# Journeys {num:03} - follow-ups keep the right programme? ({date}, dialogues unreviewed)\n\n**Verdict:** {verdict}\n");
    let _ = writeln!(out, "Plan 016 item 12, plan 010 C (katgpt `pick_latch.rs`). Run: `cargo run -q --release -p reflex-bench --bin followup -- --write`. The Rust decision order (`decide_route`) with the programme in focus carried from turn to turn, AI off, catalogue loaded. {} dialogues, {turns} turns: 6 templates x {} programme pairs (programmes whose title alone opens their card, spread over the catalogue). The dialogues are in `benchmark/journeys/followup_dialogues_001.json`; the expected programme of each turn is the author's reading, not reviewed by a person.\n", ds.len(), pairs.len());
    let _ = writeln!(out, "**Preregistered (plan 010 C):** build the latch only if it at least halves the wrong-programme rate and `route_rust_check` keeps >= 2100 singles.\n");
    let _ = writeln!(out, "| template | turns | about the wrong programme | a programme was meant, none used |\n|---|---|---|---|");
    for (t, n, w, m) in &by_template {
        let _ = writeln!(out, "| {t} | {n} | {w} | {m} |");
    }
    let _ = writeln!(out, "| **all** | {turns} | **{wrong}** of {about} programme answers | {missed} of {expected_some} |");
    let _ = writeln!(out, "\nNegative control: scored against the other programme of each pair, {control_wrong} of {about} programme answers count as wrong (the metric does see a failure).");
    if !misses.is_empty() {
        let _ = writeln!(out, "\n## Turns that missed (first {})\n", misses.len());
        for m in &misses {
            let _ = writeln!(out, "- {m}");
        }
    }
    print!("{out}");
    if write {
        std::fs::write(root.join(format!("benchmark/journeys/results/{num:03}_{date}_followup_latch.md")), &out).map_err(|e| e.to_string())?;
        std::fs::write(root.join("benchmark/journeys/followup_dialogues_001.json"), serde_json::to_string_pretty(&ds).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        eprintln!("wrote benchmark/journeys/results/{num:03}_{date}_followup_latch.md and the dialogues");
    }
    Ok(())
}
