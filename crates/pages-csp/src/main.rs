use std::process::ExitCode;

use pages_csp::run::{self, Mode, USAGE};

fn main() -> ExitCode {
    let args = match run::parse(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(msg) if msg.is_empty() => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(msg) => {
            eprintln!("pages-csp: {msg}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match (run::run(&args), args.mode) {
        (Ok(_), Mode::Check) => {
            println!("pages-csp: _headers is current");
            ExitCode::SUCCESS
        }
        (Ok(changed), Mode::Write) => {
            println!("pages-csp: _headers {}", if changed { "updated" } else { "already current" });
            ExitCode::SUCCESS
        }
        (Err(err), _) => {
            eprintln!("pages-csp: {err}");
            ExitCode::from(1)
        }
    }
}
