use std::process::{Command, ExitCode};

use reflex_gate::args::{self, ArgError};
use reflex_gate::numbering;
use reflex_gate::report;
use reflex_gate::runner;
use reflex_gate::types::GateStatus;

fn main() -> ExitCode {
    let args = match args::parse(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(ArgError::Help) => {
            println!("{}", args::USAGE);
            return ExitCode::SUCCESS;
        }
        Err(err) => {
            eprintln!("reflex-gate: {err}\n{}", args::USAGE);
            return ExitCode::from(2);
        }
    };

    let date = today();
    let outcomes = runner::run_gates(&args);
    let accepted = outcomes.iter().all(|o| o.status == GateStatus::Pass);

    let dir = args.root.join("benchmark").join("gates");
    let number = numbering::next_number(&dir);
    let file_name = numbering::result_file_name(number, &args.pack, &date);
    let body = report::render(&args.pack, &date, &outcomes);
    if let Err(err) = std::fs::create_dir_all(&dir).and_then(|()| std::fs::write(dir.join(&file_name), &body)) {
        eprintln!("reflex-gate: cannot write result file: {err}");
        return ExitCode::from(1);
    }

    println!("{body}");
    println!("result: benchmark/gates/{file_name}");
    match accepted {
        true => ExitCode::SUCCESS,
        false => ExitCode::from(1),
    }
}

/// Today's date as YYYY-MM-DD, from the system `date` command (no extra crate needed).
fn today() -> String {
    match Command::new("date").arg("+%Y-%m-%d").output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "unknown-date".to_string(),
    }
}
