//! `pack-lint <pack-or-knowledge-dir>... [--github]`: duplicate or competing titles, empty keyword lines, empty answers, missing
//! sources, answer dates after `valid_to`. Warnings only: exits 0 on a readable folder, 1 when one cannot be read, 2 on bad arguments.

use std::process::ExitCode;

use pack_tools::entry::{knowledge_dir_of, read_knowledge_dir};
use pack_tools::lint::lint;
use pack_tools::report::{line, Style};

const USAGE: &str = "usage: pack-lint <pack-or-knowledge-dir>... [--github]";

fn main() -> ExitCode {
    let mut style = Style::Text;
    let mut dirs = Vec::new();
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--github" => style = Style::Github,
            flag if flag.starts_with("--") => {
                eprintln!("pack-lint: unknown flag {flag}\n{USAGE}");
                return ExitCode::from(2);
            }
            _ => dirs.push(std::path::PathBuf::from(arg)),
        }
    }
    if dirs.is_empty() {
        eprintln!("pack-lint: give at least one pack or knowledge folder\n{USAGE}");
        return ExitCode::from(2);
    }
    let mut code = ExitCode::SUCCESS;
    for dir in &dirs {
        let kdir = knowledge_dir_of(dir);
        let shown = kdir.display().to_string();
        let entries = match read_knowledge_dir(&kdir) {
            Ok(entries) => entries,
            Err(e) => {
                eprintln!("pack-lint: {shown}: {e}");
                code = ExitCode::from(1);
                continue;
            }
        };
        let found = lint(&entries);
        let n: usize = found.iter().map(|(_, f)| f.len()).sum();
        println!("{shown}: {} entries, {n} warnings", entries.len());
        for (file, findings) in &found {
            for f in findings {
                print!("{}", line(style, &shown, file, &f.message()));
            }
        }
    }
    code
}
