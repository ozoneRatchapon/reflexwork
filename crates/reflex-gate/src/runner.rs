use std::path::Path;
use std::process::Command;

use crate::args::{Args, DEFAULT_PACK};
use crate::scan;
use crate::types::{GateId, GateOutcome, GateStatus};

const TAIL_LINES: usize = 12;
const MAX_HITS_SHOWN: usize = 20;

/// Runs gates 1-5 for `args.pack`, in order. Every gate gets an outcome, even when it cannot run.
pub fn run_gates(args: &Args) -> Vec<GateOutcome> {
    let wired = args.pack == DEFAULT_PACK;
    GateId::ALL
        .iter()
        .map(|&gate| match (gate, wired) {
            (GateId::EngineGeneric, _) => engine_generic(args),
            (GateId::SynthEval, _) => synth_eval(args),
            (_, false) => GateOutcome::new(
                gate,
                GateStatus::Skipped,
                format!("pack `{}` has no wired commands yet (plan 012 step 1 adds the pack loader)", args.pack),
            ),
            (GateId::RouteGolden, true) => route_golden(&args.root),
            (GateId::WasmGolden, true) => wasm_golden(&args.root),
            (GateId::CargoTest, true) => cargo_test(&args.root),
            (GateId::ChatE2e, true) => chat_e2e(&args.root),
        })
        .collect()
}

/// Gate 1: the route golden on the committed route answers, 0 differences.
fn route_golden(root: &Path) -> GateOutcome {
    let r = run(root, "node", &["benchmark/golden/route_golden.mjs", "--check"]);
    outcome_from_exit(GateId::RouteGolden, r)
}

/// Gate 2: the committed wasm artefact returns exactly what the page's JS returned.
fn wasm_golden(root: &Path) -> GateOutcome {
    let r = run(root, "node", &["scripts/wasm_golden_check.mjs", "submissions/ui/wasm"]);
    outcome_from_exit(GateId::WasmGolden, r)
}

/// Gate 3a: the native Rust tests of the engine.
fn cargo_test(root: &Path) -> GateOutcome {
    let r = run(root, "cargo", &["test", "-p", "reflex-wasm", "--quiet"]);
    outcome_from_exit(GateId::CargoTest, r)
}

/// Gate 3b: the end-to-end page test. It exits 0 when it skips (no Chrome, no KB), so the
/// `SKIPPED:` line decides the status, not the exit code.
fn chat_e2e(root: &Path) -> GateOutcome {
    let r = run(root, "node", &["tests/chat_e2e.test.mjs"]);
    let skipped_line = r.output.lines().find(|l| l.trim_start().starts_with("SKIPPED:")).map(str::to_string);
    match (r.started, skipped_line) {
        (false, _) => GateOutcome::new(GateId::ChatE2e, GateStatus::Fail, tail(&r.output, TAIL_LINES)),
        (true, Some(line)) => GateOutcome::new(GateId::ChatE2e, GateStatus::Skipped, line),
        (true, None) => outcome_from_exit(GateId::ChatE2e, r),
    }
}

/// Gate 4: the synth eval (first-right rate and answer-type note split) for the pack.
/// Not wired yet: it needs the pack's own `synth/` directory, which plan 012 defines.
pub fn synth_eval(args: &Args) -> GateOutcome {
    let dir = args.root.join("packs").join(&args.pack).join("synth");
    let detail = match dir.is_dir() {
        true => format!("{} exists, but the synth measurement is not wired into the runner yet", dir.display()),
        false => format!("{} not found: the pack layout (plan 012) is not created, so nothing was measured", dir.display()),
    };
    GateOutcome::new(GateId::SynthEval, GateStatus::Skipped, detail)
}

/// Gate 5: no domain words in the engine source. Passes only with zero hits.
/// Hits are expected until plan 011 moves the graduate-school vocabulary into the pack.
pub fn engine_generic(args: &Args) -> GateOutcome {
    let words = match std::fs::read_to_string(&args.words) {
        Ok(text) => scan::parse_words(&text),
        Err(err) => {
            return GateOutcome::new(GateId::EngineGeneric, GateStatus::Fail, format!("cannot read {}: {err}", args.words.display()));
        }
    };
    let src = args.root.join("crates").join("reflex-wasm").join("src");
    match scan::scan_rs_tree(&src, &words) {
        Err(err) => GateOutcome::new(GateId::EngineGeneric, GateStatus::Fail, format!("cannot scan {}: {err}", src.display())),
        Ok(hits) if hits.is_empty() => GateOutcome::new(
            GateId::EngineGeneric,
            GateStatus::Pass,
            format!("0 hits for {} words under reflex-wasm/src", words.len()),
        ),
        Ok(hits) => {
            let shown: Vec<String> = hits
                .iter()
                .take(MAX_HITS_SHOWN)
                .map(|h| format!("{}:{} `{}`", h.file.strip_prefix(&args.root).unwrap_or(&h.file).display(), h.line, h.word))
                .collect();
            let more = hits.len().saturating_sub(MAX_HITS_SHOWN);
            let suffix = match more {
                0 => String::new(),
                n => format!(" (+{n} more)"),
            };
            GateOutcome::new(
                GateId::EngineGeneric,
                GateStatus::Fail,
                format!("{} hits{suffix}: {}", hits.len(), shown.join(", ")),
            )
        }
    }
}

struct Run {
    started: bool,
    success: bool,
    output: String,
}

fn run(root: &Path, program: &str, args: &[&str]) -> Run {
    match Command::new(program).args(args).current_dir(root).output() {
        Ok(out) => {
            let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
            Run { started: true, success: out.status.success(), output: text }
        }
        Err(err) => Run { started: false, success: false, output: format!("cannot start `{program}`: {err}") },
    }
}

fn outcome_from_exit(gate: GateId, r: Run) -> GateOutcome {
    match (r.started, r.success) {
        (true, true) => GateOutcome::new(gate, GateStatus::Pass, "exit 0"),
        (true, false) => GateOutcome::new(gate, GateStatus::Fail, format!("non-zero exit: {}", tail(&r.output, TAIL_LINES))),
        (false, _) => GateOutcome::new(gate, GateStatus::Fail, r.output),
    }
}

fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}
