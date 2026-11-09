use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit {
    pub file: PathBuf,
    pub line: usize,
    pub word: String,
}

/// One term per line. Blank lines and `#` comments are skipped.
pub fn parse_words(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_string)
        .collect()
}

/// Case-insensitive substring hits of each word, one hit per (line, word).
pub fn scan_text(file: &Path, text: &str, words: &[String]) -> Vec<Hit> {
    text.lines()
        .enumerate()
        .flat_map(|(i, line)| {
            let lower = line.to_lowercase();
            words
                .iter()
                .filter(move |w| lower.contains(&w.to_lowercase()))
                .map(move |w| Hit { file: file.to_path_buf(), line: i + 1, word: w.clone() })
        })
        .collect()
}

/// Scans every `.rs` file under `dir`, recursively. Files are read as UTF-8.
pub fn scan_rs_tree(dir: &Path, words: &[String]) -> io::Result<Vec<Hit>> {
    let mut hits = Vec::new();
    walk(dir, words, &mut hits)?;
    hits.sort_by(|a, b| (&a.file, a.line).cmp(&(&b.file, b.line)));
    Ok(hits)
}

fn walk(dir: &Path, words: &[String], hits: &mut Vec<Hit>) -> io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        match (path.is_dir(), path.extension().and_then(|e| e.to_str())) {
            (true, _) => walk(&path, words, hits)?,
            (false, Some("rs")) => {
                let text = std::fs::read_to_string(&path)?;
                hits.extend(scan_text(&path, &text, words));
            }
            (false, _) => {}
        }
    }
    Ok(())
}
