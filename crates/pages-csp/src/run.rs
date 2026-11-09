//! Command-line modes: write the block, or check that it is current.

use std::path::{Path, PathBuf};

use crate::headers;
use crate::types::CspError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Write,
    Check,
}

#[derive(Debug)]
pub struct Args {
    pub mode: Mode,
    pub ui: PathBuf,
}

pub const USAGE: &str = "usage: pages-csp [--check] [--ui <submissions/ui folder>]";

/// The repo's `submissions/ui`, found from this crate's location (works from any working directory).
pub fn default_ui() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../submissions/ui")
}

pub fn parse(mut it: impl Iterator<Item = String>) -> Result<Args, String> {
    let mut args = Args { mode: Mode::Write, ui: default_ui() };
    while let Some(a) = it.next() {
        match a.as_str() {
            "--check" => args.mode = Mode::Check,
            "--ui" => args.ui = it.next().map(PathBuf::from).ok_or("--ui needs a folder")?,
            "-h" | "--help" => return Err(String::new()),
            other => return Err(format!("unknown argument `{other}`")),
        }
    }
    Ok(args)
}

/// Returns true when `_headers` was rewritten (write mode) or is current (check mode).
pub fn run(args: &Args) -> Result<bool, CspError> {
    let path = args.ui.join("_headers");
    let current = std::fs::read_to_string(&path).map_err(|err| CspError::Io { path: path.display().to_string(), err })?;
    let next = headers::splice(&current, &headers::render(&args.ui)?)?;
    match (args.mode, next == current) {
        (Mode::Check, true) => Ok(true),
        (Mode::Check, false) => Err(CspError::Stale),
        (Mode::Write, same) => {
            if !same {
                std::fs::write(&path, &next).map_err(|err| CspError::Io { path: path.display().to_string(), err })?;
            }
            Ok(!same)
        }
    }
}
