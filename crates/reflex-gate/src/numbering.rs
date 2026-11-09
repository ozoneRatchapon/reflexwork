use std::path::Path;

/// Next result number in `dir`: one more than the largest leading `NNN_` prefix, or 1 when empty or missing.
pub fn next_number(dir: &Path) -> u32 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 1;
    };
    let max = entries
        .filter_map(Result::ok)
        .filter_map(|e| leading_number(&e.file_name().to_string_lossy()))
        .max()
        .unwrap_or(0);
    max + 1
}

/// Parses the number in a file name like `007_graduate-school_2026-11-08.md`.
pub fn leading_number(name: &str) -> Option<u32> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    match (digits.is_empty(), name[digits.len()..].starts_with('_')) {
        (false, true) => digits.parse().ok(),
        _ => None,
    }
}

pub fn result_file_name(number: u32, pack: &str, date: &str) -> String {
    format!("{number:03}_{pack}_{date}.md")
}
