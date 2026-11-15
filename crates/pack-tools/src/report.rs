//! How the pack reports (`pack-expiry`, `pack-lint`) write one finding: plain text, or a GitHub Actions `::warning::`
//! annotation (shown on the run, never failing it).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    Text,
    Github,
}

/// One finding about `file` in knowledge folder `dir`.
pub fn line(style: Style, dir: &str, file: &str, msg: &str) -> String {
    match style {
        Style::Text => format!("  {file}: {msg}\n"),
        Style::Github => format!("::warning file={dir}/{file}::{msg}\n"),
    }
}
