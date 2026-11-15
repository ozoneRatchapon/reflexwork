//! `pack-watch <pack> [--report out.md] [--save dir | --pages dir] [--today YYYY-MM-DD]`: re-read every page the pack cites (plain
//! `curl`, one request per page, 1 s apart; no bot-check bypass) and report entries stating dates or names the page does not show.
//! Exit 0: nothing changed. 10: changes (the workflow opens a PR with the report). 1: the pack cannot be read. 2: bad arguments.
//! `--pages dir` reads saved pages instead of fetching (tests, re-runs); `--save dir` keeps what was fetched.

use std::fs;
use std::path::PathBuf;
use std::process::{Command, ExitCode};
use std::time::Duration;

use pack_tools::dates::{parse_ymd, today};
use pack_tools::entry::read_pack;
use pack_tools::watch::{by_source, compare, markdown, pack_dates, Fetched};

const USAGE: &str = "usage: pack-watch <pack> [--report out.md] [--save dir | --pages dir] [--today YYYY-MM-DD]";
const USER_AGENT: &str = "reflexwork-pack-watch/0.1 (weekly check of pages a knowledge pack cites)";

#[derive(Default)]
struct Args {
    pack: Option<PathBuf>,
    report: Option<PathBuf>,
    save: Option<PathBuf>,
    pages: Option<PathBuf>,
    today: Option<i64>,
}

fn parse(args: impl IntoIterator<Item = String>) -> Result<Args, String> {
    let mut a = Args::default();
    let mut it = args.into_iter();
    while let Some(arg) = it.next() {
        let mut value = |flag: &str| it.next().ok_or(format!("{flag} needs a value"));
        match arg.as_str() {
            "-h" | "--help" => return Err(String::new()),
            "--report" => a.report = Some(value("--report")?.into()),
            "--save" => a.save = Some(value("--save")?.into()),
            "--pages" => a.pages = Some(value("--pages")?.into()),
            "--today" => {
                let v = value("--today")?;
                a.today = Some(parse_ymd(&v).ok_or(format!("--today {v} is not YYYY-MM-DD"))?);
            }
            flag if flag.starts_with("--") => return Err(format!("unknown flag {flag}")),
            _ if a.pack.is_none() => a.pack = Some(arg.into()),
            _ => return Err("only one pack".to_string()),
        }
    }
    match (&a.pack, &a.save, &a.pages) {
        (None, _, _) => Err("give a pack folder".to_string()),
        (_, Some(_), Some(_)) => Err("--save and --pages exclude each other".to_string()),
        _ => Ok(a),
    }
}

/// File name for a saved page: the URL with everything but letters and digits as `_`.
fn slug(url: &str) -> String {
    url.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect::<String>() + ".html"
}

fn fetch(url: &str) -> Fetched {
    let out = Command::new("curl")
        .args(["-sS", "-L", "--max-time", "30", "-A", USER_AGENT, "-w", "\n%{http_code}", url])
        .output();
    let out = match out {
        Ok(o) => o,
        Err(e) => return Fetched::Refused(format!("curl did not run: {e}")),
    };
    if !out.status.success() {
        return Fetched::Refused(format!("curl: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let body = String::from_utf8_lossy(&out.stdout);
    let (html, code) = body.rsplit_once('\n').unwrap_or(("", &body));
    match code.trim() {
        "200" => Fetched::Html(html.to_string()),
        other => Fetched::Refused(format!("HTTP {other}")),
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
            eprintln!("pack-watch: {msg}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let pack = args.pack.unwrap_or_default();
    let entries = match read_pack(&pack) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("pack-watch: {}: {e}", pack.display());
            return ExitCode::from(1);
        }
    };
    let today = args.today.unwrap_or_else(today);
    if let Some(dir) = &args.save {
        if let Err(e) = fs::create_dir_all(dir) {
            eprintln!("pack-watch: {}: {e}", dir.display());
            return ExitCode::from(1);
        }
    }
    let known = pack_dates(&entries);
    let mut reports = Vec::new();
    for (i, (url, cited)) in by_source(&entries).into_iter().enumerate() {
        let fetched = match &args.pages {
            Some(dir) => fs::read_to_string(dir.join(slug(&url))).map_or_else(|_| Fetched::Refused(format!("not saved in {}", dir.display())), Fetched::Html),
            None => {
                if i > 0 {
                    std::thread::sleep(Duration::from_secs(1));
                }
                fetch(&url)
            }
        };
        if let (Some(dir), Fetched::Html(html)) = (&args.save, &fetched) {
            let _ = fs::write(dir.join(slug(&url)), html);
        }
        if let Fetched::Refused(reason) = &fetched {
            println!("::warning::pack-watch could not read {url} ({reason})");
        }
        reports.push(compare(&url, &cited, &fetched, &known, today));
    }
    let md = markdown(&pack.display().to_string(), &reports);
    print!("{md}");
    if let Some(path) = &args.report {
        if let Err(e) = fs::write(path, &md) {
            eprintln!("pack-watch: {}: {e}", path.display());
            return ExitCode::from(1);
        }
    }
    match reports.iter().any(pack_tools::watch::PageReport::changed) {
        true => ExitCode::from(10),
        false => ExitCode::SUCCESS,
    }
}
