//! `pack-golden <pack-dir> <site-dir> <golden.json> [--write] [--today YYYY-MM-DD]`: a pack's own route golden (plan 019 item 6.3).
//! `<site-dir>` is what `scripts/new_agency.mjs <pack-dir> <site-dir> [--draft]` built (its knowledge-index.json and agency.json, with the
//! pack's `vocab` if it has one); the question pool also reads the pack's questions.txt and expected.json. Without `--write` it checks:
//! the decisions are recomputed on the golden's own day and every difference is printed.
//! Exit codes: 0 written or identical, 1 different or unreadable input, 2 bad arguments.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use pack_tools::golden::{case, diff, manual, pool, render, route_counts, state, Sources};
use serde_json::Value;

const USAGE: &str = "usage: pack-golden <pack-dir> <site-dir> <golden.json> [--write] [--today YYYY-MM-DD]";

fn main() -> ExitCode {
    let (mut write, mut today, mut paths) = (false, None, Vec::new());
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--write" => write = true,
            "--today" => match args.next().filter(|d| is_iso_day(d)) {
                Some(d) => today = Some(d),
                None => return usage("--today needs a day as YYYY-MM-DD"),
            },
            flag if flag.starts_with("--") => return usage(&format!("unknown flag {flag}")),
            _ => paths.push(PathBuf::from(arg)),
        }
    }
    let [pack, site, golden] = paths.as_slice() else {
        return usage("give the pack folder, the built site folder and the golden file");
    };
    match run(pack, site, golden, write, today) {
        Ok(msg) => {
            println!("{msg}");
            ExitCode::SUCCESS
        }
        Err(msg) => {
            eprintln!("pack-golden: {msg}");
            ExitCode::from(1)
        }
    }
}

fn usage(msg: &str) -> ExitCode {
    eprintln!("pack-golden: {msg}\n{USAGE}");
    ExitCode::from(2)
}

fn is_iso_day(d: &str) -> bool {
    let b = d.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn read(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

fn read_json(path: &Path) -> Result<Value, String> {
    serde_json::from_str(&read(path)?).map_err(|e| format!("{}: {e}", path.display()))
}

/// An optional file of the pack: absent is fine, unreadable or invalid is an error.
fn optional<T>(path: PathBuf, parse: impl Fn(&Path) -> Result<T, String>) -> Result<Option<T>, String> {
    match path.exists() {
        true => parse(&path).map(Some),
        false => Ok(None),
    }
}

fn run(pack: &Path, site: &Path, golden_path: &Path, write: bool, today: Option<String>) -> Result<String, String> {
    let Value::Array(index) = read_json(&site.join("knowledge-index.json"))? else {
        return Err(format!("{}: not a JSON list of entries", site.join("knowledge-index.json").display()));
    };
    let agency = read_json(&site.join("agency.json"))?;
    let questions = optional(pack.join("questions.txt"), read)?;
    let expected = optional(pack.join("expected.json"), read_json)?;
    let old = optional(golden_path.to_path_buf(), read_json)?;
    let old_cases = old.as_ref().and_then(|g| g["cases"].as_array()).cloned().unwrap_or_default();
    // check: the golden's own day (a decision reads the manual's dates against it); write: --today, else the golden's day
    let today = match (write, today, old.as_ref().and_then(|g| g["today"].as_str())) {
        (false, Some(_), _) => return Err("--today is only for --write (a check runs on the golden's own day)".into()),
        (false, None, None) => return Err(format!("{}: missing or has no day, record it with --write --today YYYY-MM-DD", golden_path.display())),
        (_, Some(d), _) => d,
        (_, None, Some(d)) => d.to_string(),
        (true, None, None) => return Err("a new golden needs --today YYYY-MM-DD".into()),
    };
    // the pack's own route words, installed once for this process as the page does (`new Router(KB, null, vocab)`)
    if let Some(vocab) = agency.get("vocab").filter(|v| !v.is_null()) {
        reflex_wasm::route::vocab::install(&vocab.to_string())?;
    }
    let manual = manual(&index)?;
    let state = state(Some(&agency), &today);
    let src = Sources { agency: Some(&agency), questions: questions.as_deref(), expected: expected.as_ref() };
    let cases = pool(&index, &src).iter().map(|q| case(q, &state, &manual)).collect::<Result<Vec<_>, _>>()?;
    let shown = golden_path.display();
    let summary = route_counts(&cases).iter().map(|(r, n)| format!("{n} {r}")).collect::<Vec<_>>().join(", ");
    match write {
        true => {
            if let Some(dir) = golden_path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
            }
            std::fs::write(golden_path, render(&today, &cases)).map_err(|e| format!("{shown}: {e}"))?;
            Ok(format!("wrote {shown}: {} questions on {today} ({summary})", cases.len()))
        }
        false => match diff(&old_cases, &cases) {
            d if d.is_empty() => Ok(format!("{shown}: {} questions, 0 differences ({summary})", cases.len())),
            d => Err(format!("{shown}: {} difference(s)\n{}\nchanged on purpose? record again with --write", d.len(), d.join("\n"))),
        },
    }
}
