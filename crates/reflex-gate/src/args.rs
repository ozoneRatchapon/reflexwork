use std::fmt;
use std::path::PathBuf;

pub const USAGE: &str = "usage: reflex-gate [--pack <name>] [--root <repo dir>] [--words <file>]\n\
  --pack   pack to gate (default: graduate-school; the only wired pack today)\n\
  --root   repository root (default: current directory)\n\
  --words  gate-5 word list, one term per line (default: crates/reflex-gate/words/graduate_school.txt under root)";

pub const DEFAULT_PACK: &str = "graduate-school";
pub const DEFAULT_WORDS: &str = "crates/reflex-gate/words/graduate_school.txt";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Args {
    pub pack: String,
    pub root: PathBuf,
    pub words: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArgError {
    Help,
    MissingValue(String),
    UnknownFlag(String),
}

impl fmt::Display for ArgError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArgError::Help => write!(f, "help requested"),
            ArgError::MissingValue(flag) => write!(f, "{flag} needs a value"),
            ArgError::UnknownFlag(flag) => write!(f, "unknown flag {flag}"),
        }
    }
}

impl std::error::Error for ArgError {}

/// Parses the command line. Flags take one value each; `--help` returns `ArgError::Help`.
pub fn parse<I: IntoIterator<Item = String>>(argv: I) -> Result<Args, ArgError> {
    let mut pack = DEFAULT_PACK.to_string();
    let mut root = PathBuf::from(".");
    let mut words: Option<PathBuf> = None;
    let mut it = argv.into_iter();
    while let Some(flag) = it.next() {
        match flag.as_str() {
            "--help" | "-h" => return Err(ArgError::Help),
            "--pack" => pack = take_value(&mut it, &flag)?,
            "--root" => root = PathBuf::from(take_value(&mut it, &flag)?),
            "--words" => words = Some(PathBuf::from(take_value(&mut it, &flag)?)),
            other => return Err(ArgError::UnknownFlag(other.to_string())),
        }
    }
    let words = words.unwrap_or_else(|| root.join(DEFAULT_WORDS));
    Ok(Args { pack, root, words })
}

fn take_value<I: Iterator<Item = String>>(it: &mut I, flag: &str) -> Result<String, ArgError> {
    it.next().ok_or_else(|| ArgError::MissingValue(flag.to_string()))
}
