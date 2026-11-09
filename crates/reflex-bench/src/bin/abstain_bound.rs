//! Plan 016 item 4 (katgpt D): a certified bound on "answered with a wrong entry" for each score threshold, and the shipped rule.
//!   cargo run -q --release -p reflex-bench --bin abstain_bound            # print
//!   cargo run -q --release -p reflex-bench --bin abstain_bound -- --write # also write benchmark/abstain/NNN_<date>_certified_bound.md
use std::collections::HashSet;
use std::fmt::Write as _;

use reflex_bench::bound::cp_upper;
use reflex_bench::data::{generated, manual, repo_root, reviewed};
use reflex_bench::numbering::{next_number, today};
use reflex_bench::score::{count, outcomes};
use reflex_bench::types::{Counts, Outcome};

const DELTA: f64 = 0.05;
const EPSILONS: [f64; 2] = [0.10, 0.20];

fn pct(a: usize, b: usize) -> String {
    match b {
        0 => "-".into(),
        _ => format!("{:.1} %", 100.0 * a as f64 / b as f64),
    }
}

fn row(name: &str, c: Counts) -> String {
    let ub = cp_upper(c.wrong, c.answered, DELTA);
    format!(
        "| {name} | {} | {} | {} | {} | {:.1} % |",
        c.answered,
        pct(c.kept, c.positives),
        pct(c.neg_answered, c.negatives),
        pct(c.wrong, c.answered),
        100.0 * ub
    )
}

fn table(out: &mut String, title: &str, outs: &[Outcome]) -> Vec<(i32, Counts)> {
    let shipped = count(outs, |o| o.shipped_act);
    let sweep: Vec<(i32, Counts)> = (1..=6).map(|t| (t, count(outs, |o| o.top_s >= t))).collect();
    let _ = writeln!(out, "\n### {title} ({} questions: {} right-answer positives, {} negatives)\n", shipped.n, shipped.positives, shipped.negatives);
    let _ = writeln!(out, "| rule | answered | keeps right answers | answers when it should not | wrong among answered | upper bound (95 %) |");
    let _ = writeln!(out, "|---|---|---|---|---|---|");
    let _ = writeln!(out, "{}", row("**shipped tier rule**", shipped));
    for (t, c) in &sweep {
        let _ = writeln!(out, "{}", row(&format!("top score >= {t}"), *c));
    }
    for eps in EPSILONS {
        let pick = sweep.iter().find(|(_, c)| c.answered > 0 && cp_upper(c.wrong, c.answered, DELTA) <= eps);
        let _ = writeln!(
            out,
            "\nLowest threshold whose bound is <= {:.0} %: {}",
            100.0 * eps,
            pick.map_or("none in 1-6".into(), |(t, c)| format!("**top score >= {t}** (keeps {} of right answers)", pct(c.kept, c.positives)))
        );
    }
    let ship_ub = cp_upper(shipped.wrong, shipped.answered, DELTA);
    let _ = writeln!(out, "\nShipped rule: of {} answers, {} wrong ({}); with 95 % confidence the wrong rate on questions like these is at most **{:.1} %**.", shipped.answered, shipped.wrong, pct(shipped.wrong, shipped.answered), 100.0 * ship_ub);
    sweep
}

fn main() -> Result<(), String> {
    let write = std::env::args().any(|a| a == "--write");
    let root = repo_root();
    let kb = manual(&root)?;
    let ids: HashSet<String> = kb.iter().map(|e| e.id.clone()).collect();
    let rev = outcomes(&kb, &reviewed(&root, &ids)?);
    let gen = outcomes(&kb, &generated(&root)?);
    let shipped = count(&rev, |o| o.shipped_act);

    let mut out = String::new();
    let date = today();
    let _ = writeln!(out, "# Abstain {:03} - a certified bound on wrong answers per threshold ({date})\n", next_number(&root.join("benchmark/abstain")));
    let _ = writeln!(out, "Plan 016 item 4 (katgpt-rs `certified_frontier.rs` `cp_upper`, plan 010 Second look D). Run: `cargo run -q --release -p reflex-bench --bin abstain_bound -- --write`.");
    let _ = writeln!(out, "Search and tier rule: the native twin of the shipped wasm (`reflex_wasm::kb_rank`, `decide::decide_tier`, gate 0.061 as in experiment 001).\n");
    let _ = writeln!(out, "**Preregistered (before the run):** G1 the shipped row on the reviewed set reproduces experiment 001's shipped row (keeps 96.1 %, answers negatives 53.0 %) within 1 point, else the harness is wrong and nothing below counts. G2 report, per threshold, the one-sided Clopper-Pearson upper bound (delta = 0.05) on \"wrong among answered\", and the lowest threshold whose bound is <= 10 % and <= 20 %. No adoption decision is tied to this file: it adds no score or gate (AUROC cannot change), it states what can be promised.\n");
    let g1 = (100.0 * shipped.kept as f64 / shipped.positives.max(1) as f64 - 96.1).abs() <= 1.0 && (100.0 * shipped.neg_answered as f64 / shipped.negatives.max(1) as f64 - 53.0).abs() <= 1.0;
    let mut body = String::new();
    let rev_sweep = table(&mut body, "Reviewed questions (eval52 + official FAQ variants + not-in-manual + staff-only)", &rev);
    table(&mut body, "Generated questions, labels NOT reviewed (synth/questions_001.json; near-misses count as should-not-answer)", &gen);
    let eps10 = rev_sweep.iter().find(|(_, c)| c.answered > 0 && cp_upper(c.wrong, c.answered, DELTA) <= 0.10);
    let verdict = match (g1, eps10) {
        (false, _) => "G1 FAILED: the harness does not reproduce experiment 001; the numbers below are not trusted.".to_string(),
        (true, Some((t, c))) => format!("G1 pass. The shipped rule's wrong rate among its answers is at most {:.1} % (95 %); a promise of <= 10 % needs top score >= {t}, which keeps {} of right answers.", 100.0 * cp_upper(shipped.wrong, shipped.answered, DELTA), pct(c.kept, c.positives)),
        (true, None) => format!("G1 pass. The shipped rule's wrong rate among its answers is at most {:.1} % (95 %); no threshold 1-6 (the top score is at most 6) can promise <= 10 % on the reviewed set.", 100.0 * cp_upper(shipped.wrong, shipped.answered, DELTA)),
    };
    let _ = writeln!(out, "**Verdict:** {verdict}");
    let _ = writeln!(out, "\nG1 check: shipped on the reviewed set keeps {} of right answers and answers {} of negatives (experiment 001: 96.1 % / 53.0 %).", pct(shipped.kept, shipped.positives), pct(shipped.neg_answered, shipped.negatives));
    out.push_str(&body);
    let _ = writeln!(out, "\n## Reading\n- \"Wrong among answered\" counts an answer as wrong when the top entry is not a gold entry, including every answer to a question the manual does not cover.\n- The bound holds for questions drawn like these sets, not for live traffic; the reviewed set has 3 known label slips in 60 checked (synth 009) and the generated set is unreviewed.\n- A higher threshold buys a smaller promise by answering less; the abstain separation itself (AUROC ~0.5-0.6) is unchanged.");
    print!("{out}");
    if write {
        let path = root.join(format!("benchmark/abstain/{:03}_{date}_certified_bound.md", next_number(&root.join("benchmark/abstain"))));
        std::fs::write(&path, &out).map_err(|e| e.to_string())?;
        eprintln!("wrote {}", path.display());
    }
    Ok(())
}
