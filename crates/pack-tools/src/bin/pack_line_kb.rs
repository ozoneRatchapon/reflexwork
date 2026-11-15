//! `pack-line-kb <knowledge-index.json> <out.mjs> [--agency agency.json] [--check]`: the LINE worker's manual (`export const KB`) from a
//! site's index, e.g. the one `scripts/new_agency.mjs` builds from a pack. `--agency` adds `LINE_VOICE` (the agency's small talk and
//! example questions, so the bot never speaks as the Graduate School). `--check` writes nothing and exits 1 when `out.mjs` differs.
//! Exit codes: 0 written or up to date, 1 unreadable input or out of date, 2 bad arguments.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use pack_tools::line_kb::{render, unapproved};
use serde_json::Value;

const USAGE: &str = "usage: pack-line-kb <knowledge-index.json> <out.mjs> [--agency agency.json] [--check]";

fn main() -> ExitCode {
    let mut check = false;
    let mut agency = None;
    let mut paths = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--check" => check = true,
            "--agency" => match args.next() {
                Some(path) => agency = Some(PathBuf::from(path)),
                None => {
                    eprintln!("pack-line-kb: --agency needs a file\n{USAGE}");
                    return ExitCode::from(2);
                }
            },
            flag if flag.starts_with("--") => {
                eprintln!("pack-line-kb: unknown flag {flag}\n{USAGE}");
                return ExitCode::from(2);
            }
            _ => paths.push(PathBuf::from(arg)),
        }
    }
    let [index_path, out_path] = paths.as_slice() else {
        eprintln!("pack-line-kb: give the index and the output file\n{USAGE}");
        return ExitCode::from(2);
    };
    match run(index_path, out_path, agency.as_ref(), check) {
        Ok(msg) => {
            println!("{msg}");
            ExitCode::SUCCESS
        }
        Err(msg) => {
            eprintln!("pack-line-kb: {msg}");
            ExitCode::from(1)
        }
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let shown = path.display();
    let text = std::fs::read_to_string(path).map_err(|e| format!("{shown}: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("{shown}: {e}"))
}

fn run(index_path: &Path, out_path: &Path, agency: Option<&PathBuf>, check: bool) -> Result<String, String> {
    let shown = index_path.display();
    let Value::Array(index) = read_json(index_path)? else {
        return Err(format!("{shown}: not a JSON list of entries"));
    };
    let agency = agency.map(|p| read_json(p)).transpose()?;
    if agency.as_ref().is_some_and(|a| !a.is_object()) {
        return Err("agency.json is not a JSON object".to_string());
    }
    let module = render(&index, &shown.to_string(), agency.as_ref());
    let out = out_path.display();
    let draft = match unapproved(&index) {
        0 => String::new(),
        n => format!(", {n} not yet approved (preview only)"),
    };
    match check {
        true => match std::fs::read_to_string(out_path).ok().as_deref() == Some(module.as_str()) {
            true => Ok(format!("{out}: up to date ({} entries{draft})", index.len())),
            false => Err(format!("{out}: out of date, run without --check")),
        },
        false => {
            std::fs::write(out_path, &module).map_err(|e| format!("{out}: {e}"))?;
            Ok(format!("wrote {out} ({} entries{draft})", index.len()))
        }
    }
}
