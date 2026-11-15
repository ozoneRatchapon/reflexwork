//! `pack-expiry <pack-or-knowledge-dir>... [--github] [--today YYYY-MM-DD] [--soon-days N]`: entries past `valid_to` or ending soon.
//! Always exits 0 on a readable pack (a report, not a gate); 1 when a folder cannot be read, 2 on bad arguments.

use std::path::PathBuf;
use std::process::ExitCode;

use pack_tools::dates::{parse_ymd, today};
use pack_tools::entry::{knowledge_dir_of, read_knowledge_dir};
use pack_tools::expiry::{format, report};
use pack_tools::report::Style;
use pack_tools::review::SOON_DAYS;

const USAGE: &str = "usage: pack-expiry <pack-or-knowledge-dir>... [--github] [--today YYYY-MM-DD] [--soon-days N]";

struct Args {
    dirs: Vec<PathBuf>,
    style: Style,
    today: i64,
    soon_days: i64,
}

fn parse(args: impl IntoIterator<Item = String>) -> Result<Args, String> {
    let mut a = Args { dirs: Vec::new(), style: Style::Text, today: today(), soon_days: SOON_DAYS };
    let mut it = args.into_iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "-h" | "--help" => return Err(String::new()),
            "--github" => a.style = Style::Github,
            "--today" => {
                let v = it.next().ok_or("--today needs a value")?;
                a.today = parse_ymd(&v).ok_or(format!("--today {v} is not YYYY-MM-DD"))?;
            }
            "--soon-days" => {
                let v = it.next().ok_or("--soon-days needs a value")?;
                a.soon_days = v.parse().map_err(|_| format!("--soon-days {v} is not a number"))?;
            }
            flag if flag.starts_with("--") => return Err(format!("unknown flag {flag}")),
            _ => a.dirs.push(arg.into()),
        }
    }
    match a.dirs.is_empty() {
        true => Err("give at least one pack or knowledge folder".to_string()),
        false => Ok(a),
    }
}

fn main() -> ExitCode {
    let args = match parse(std::env::args().skip(1)) {
        Ok(a) => a,
        Err(msg) if msg.is_empty() => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(msg) => {
            eprintln!("pack-expiry: {msg}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let mut code = ExitCode::SUCCESS;
    for dir in &args.dirs {
        let kdir = knowledge_dir_of(dir);
        match read_knowledge_dir(&kdir) {
            Ok(entries) => print!("{}", format(&report(&entries, args.today, args.soon_days), &kdir.display().to_string(), args.style)),
            Err(e) => {
                eprintln!("pack-expiry: {}: {e}", kdir.display());
                code = ExitCode::from(1);
            }
        }
    }
    code
}
