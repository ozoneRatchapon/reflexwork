//! `pack-review` arguments and the one run it does.

use std::fs;
use std::path::{Path, PathBuf};

use crate::dates::today;
use crate::entry::read_pack;
use crate::review::{render, ReviewInput};

pub const USAGE: &str = "usage: pack-review <pack-dir> <out.html> [--prefix <path of pack-dir/knowledge from the repository root>]";

#[derive(Debug, PartialEq, Eq)]
pub struct Args {
    pub pack: PathBuf,
    pub out: PathBuf,
    /// Defaults to `<pack-dir>/knowledge` as given on the command line.
    pub prefix: String,
}

/// `Err("")` means help was asked for.
pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Args, String> {
    let mut positional = Vec::new();
    let mut prefix = None;
    let mut it = args.into_iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "-h" | "--help" => return Err(String::new()),
            "--prefix" => prefix = Some(it.next().ok_or("--prefix needs a value")?),
            flag if flag.starts_with("--") => return Err(format!("unknown flag {flag}")),
            _ => positional.push(a),
        }
    }
    let [pack, out] = <[String; 2]>::try_from(positional).map_err(|p| format!("expected 2 paths, got {}", p.len()))?;
    let prefix = prefix.unwrap_or_else(|| format!("{}/knowledge", pack.trim_end_matches('/')));
    Ok(Args { pack: pack.into(), out: out.into(), prefix })
}

fn agency_name(pack: &Path) -> Result<String, String> {
    let path = pack.join("agency.json");
    let text = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    match json.get("name").and_then(|v| v.as_str()) {
        Some(name) if !name.is_empty() => Ok(name.to_string()),
        _ => Err(format!("{} needs \"name\"", path.display())),
    }
}

/// Write the page; returns (entries, entries not yet approved).
pub fn run(args: &Args) -> Result<(usize, usize), String> {
    let name = agency_name(&args.pack)?;
    let entries = read_pack(&args.pack).map_err(|e| format!("{}/knowledge: {e}", args.pack.display()))?;
    let html = render(&ReviewInput { agency_name: &name, entries: &entries, path_prefix: &args.prefix, today: today() });
    fs::write(&args.out, html).map_err(|e| format!("{}: {e}", args.out.display()))?;
    let pending = entries.iter().filter(|e| e.status != crate::types::Status::Approved).count();
    Ok((entries.len(), pending))
}
