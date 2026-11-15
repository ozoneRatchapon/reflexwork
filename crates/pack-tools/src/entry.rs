//! Read a pack's `knowledge/*.md` entries. The frontmatter grammar matches `submissions/build_knowledge_index.py`
//! (`key: "value"` lines between the first two `---` lines), so the review page shows what the index builder sees.

use std::fs;
use std::io;
use std::path::Path;

use crate::types::{Entry, Status};

/// One `key: value` frontmatter line, quotes stripped. `None` when the line is not of that shape.
fn fm_pair(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    if key.is_empty() || !key.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') {
        return None;
    }
    let value = value.trim();
    let value = value.strip_prefix('"').unwrap_or(value);
    let value = value.strip_suffix('"').unwrap_or(value);
    Some((key, value))
}

/// Parse one entry. `Err` names what is wrong when the file has no frontmatter.
pub fn parse_entry(file_name: &str, text: &str) -> Result<Entry, String> {
    let trailing_newline = text.ends_with('\n');
    let lines: Vec<String> = text.lines().map(str::to_string).collect();
    if lines.first().map(String::as_str) != Some("---") {
        return Err(format!("{file_name}: no frontmatter (the first line must be ---)"));
    }
    let Some(end) = lines.iter().skip(1).position(|l| l == "---").map(|i| i + 1) else {
        return Err(format!("{file_name}: frontmatter is not closed (no second --- line)"));
    };
    let mut entry = Entry {
        file_name: file_name.to_string(),
        title: String::new(),
        category: String::new(),
        source_name: String::new(),
        source_url: String::new(),
        language: String::new(),
        valid_to: None,
        status: Status::Missing,
        body: lines[end + 1..].join("\n").trim().to_string(),
        lines: Vec::new(),
        trailing_newline,
        status_line: None,
    };
    for (i, line) in lines.iter().enumerate().take(end).skip(1) {
        let Some((key, value)) = fm_pair(line) else { continue };
        match key {
            "title" => entry.title = value.to_string(),
            "category" => entry.category = value.to_string(),
            "source_name" => entry.source_name = value.to_string(),
            "source_url" => entry.source_url = value.to_string(),
            "language" => entry.language = value.to_string(),
            "valid_to" if !value.is_empty() => entry.valid_to = Some(value.to_string()),
            "approval_status" => {
                entry.status = Status::parse(Some(value));
                entry.status_line = Some(i);
            }
            _ => {}
        }
    }
    entry.lines = lines;
    Ok(entry)
}

/// Every `*.md` under `<pack>/knowledge/`, sorted by file name. A file that does not parse is an error, not skipped.
pub fn read_pack(pack: &Path) -> io::Result<Vec<Entry>> {
    read_knowledge_dir(&pack.join("knowledge"))
}

/// The knowledge folder of `path`: `path/knowledge` when it is a pack, else `path` itself (e.g. `submissions/ui/knowledge-public`).
pub fn knowledge_dir_of(path: &Path) -> std::path::PathBuf {
    match path.join("knowledge").is_dir() {
        true => path.join("knowledge"),
        false => path.to_path_buf(),
    }
}

/// Every `*.md` directly in `dir`, sorted by file name. A file that does not parse is an error, not skipped.
pub fn read_knowledge_dir(dir: &Path) -> io::Result<Vec<Entry>> {
    let mut names: Vec<String> = fs::read_dir(dir)?
        .filter_map(std::result::Result::ok)
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".md"))
        .collect();
    names.sort();
    names
        .iter()
        .map(|name| {
            let text = fs::read_to_string(dir.join(name))?;
            parse_entry(name, &text).map_err(|msg| io::Error::new(io::ErrorKind::InvalidData, msg))
        })
        .collect()
}
