use std::process::ExitCode;

use pack_tools::run::{self, USAGE};

fn main() -> ExitCode {
    let args = match run::parse(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(msg) if msg.is_empty() => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(msg) => {
            eprintln!("pack-review: {msg}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match run::run(&args) {
        Ok((total, pending)) => {
            println!("pack-review: {} ({total} entries, {pending} not approved)", args.out.display());
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("pack-review: {err}");
            ExitCode::from(1)
        }
    }
}
