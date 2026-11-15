//! `pack-workers <pack-dir> <site-dir> [--line] [--kernel] [--repo <root>]`: write an agency's Worker configs next to its built site,
//! in `<site-dir>.workers/` (never inside the site folder, which is published as it is). Placeholders only; nothing deploys.
//! Prints each file and the placeholders the owner must still fill. Exit codes: 0 written, 1 error, 2 bad arguments.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use pack_tools::workers::{files, placeholders, Want};
use serde_json::Value;

const USAGE: &str = "usage: pack-workers <pack-dir> <site-dir> [--line] [--kernel] [--repo <repository root>]";

fn main() -> ExitCode {
    let mut want = Want { line: false, kernel: false };
    let mut repo = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."));
    let mut paths = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--line" => want.line = true,
            "--kernel" => want.kernel = true,
            "--repo" => match args.next() {
                Some(r) => repo = PathBuf::from(r),
                None => return usage("--repo needs a folder"),
            },
            flag if flag.starts_with("--") => return usage(&format!("unknown flag {flag}")),
            _ => paths.push(PathBuf::from(arg)),
        }
    }
    let [pack, site] = paths.as_slice() else {
        return usage("give the pack folder and the built site folder");
    };
    if !want.line && !want.kernel {
        return usage("choose --line, --kernel or both");
    }
    match run(pack, site, &repo, want) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("pack-workers: {e}");
            ExitCode::from(1)
        }
    }
}

fn usage(msg: &str) -> ExitCode {
    eprintln!("pack-workers: {msg}\n{USAGE}");
    ExitCode::from(2)
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn absolute(p: &Path) -> Result<PathBuf, String> {
    std::fs::canonicalize(p).map_err(|e| format!("{}: {e}", p.display()))
}

fn run(pack: &Path, site: &Path, repo: &Path, want: Want) -> Result<(), String> {
    let agency = read_json(&pack.join("agency.json"))?;
    let index_path = site.join("knowledge-index.json");
    let Value::Array(index) = read_json(&index_path)? else {
        return Err(format!("{}: not a JSON list of entries", index_path.display()));
    };
    let site = absolute(site)?;
    let dir = site.with_file_name(format!("{}.workers", site.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()));
    if dir.read_dir().is_ok_and(|mut d| d.next().is_some()) {
        return Err(format!("{} is not empty (choose a new site folder)", dir.display()));
    }
    let out = files(&agency, &index, "knowledge-index.json", &dir, &absolute(repo)?, want)?;
    for f in &out {
        let path = dir.join(&f.rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        std::fs::write(&path, &f.text).map_err(|e| format!("{}: {e}", path.display()))?;
        println!("wrote {}", path.display());
    }
    let todo = placeholders(&out);
    println!("still to fill in ({}; the agency decides these; nothing is deployed):", todo.len());
    for t in &todo {
        println!("  {t}");
    }
    Ok(())
}
