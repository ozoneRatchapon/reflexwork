use std::path::{Path, PathBuf};

use reflex_gate::args::{self, ArgError, Args, DEFAULT_PACK};
use reflex_gate::numbering::{leading_number, next_number, result_file_name};
use reflex_gate::report;
use reflex_gate::runner;
use reflex_gate::scan::{parse_words, scan_rs_tree, scan_text};
use reflex_gate::types::{GateId, GateOutcome, GateStatus};

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("reflex-gate-test-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn argv(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn parse_defaults_to_graduate_school_and_repo_word_list() {
    let parsed = args::parse(argv(&[])).expect("defaults parse");
    assert_eq!(parsed.pack, DEFAULT_PACK);
    assert_eq!(parsed.root, Path::new("."));
    assert_eq!(parsed.words, Path::new("./crates/reflex-gate/words/graduate_school.txt"));
}

#[test]
fn parse_reads_flags_and_rejects_unknown_or_missing_values() {
    let parsed = args::parse(argv(&["--pack", "stub", "--root", "/tmp/r", "--words", "w.txt"])).expect("flags parse");
    assert_eq!(parsed, Args { pack: "stub".into(), root: "/tmp/r".into(), words: "w.txt".into() });
    assert_eq!(args::parse(argv(&["--nope"])), Err(ArgError::UnknownFlag("--nope".into())));
    assert_eq!(args::parse(argv(&["--pack"])), Err(ArgError::MissingValue("--pack".into())));
    assert_eq!(args::parse(argv(&["--help"])), Err(ArgError::Help));
}

#[test]
fn leading_number_needs_digits_then_underscore() {
    assert_eq!(leading_number("007_graduate-school_2026-11-08.md"), Some(7));
    assert_eq!(leading_number("README.md"), None);
    assert_eq!(leading_number("12-no-underscore.md"), None);
    assert_eq!(leading_number("_000.md"), None);
}

#[test]
fn next_number_is_one_past_the_max_and_starts_at_one() {
    let dir = temp_dir("numbering");
    assert_eq!(next_number(&dir), 1, "empty dir starts at 1");
    assert_eq!(next_number(&dir.join("missing")), 1, "missing dir starts at 1");
    std::fs::write(dir.join("001_a_2026-11-08.md"), "").unwrap();
    std::fs::write(dir.join("009_b_2026-11-08.md"), "").unwrap();
    std::fs::write(dir.join("notes.md"), "").unwrap();
    assert_eq!(next_number(&dir), 10);
}

#[test]
fn result_file_name_zero_pads_to_three_digits() {
    assert_eq!(result_file_name(3, "graduate-school", "2026-11-08"), "003_graduate-school_2026-11-08.md");
    assert_eq!(result_file_name(1234, "x", "2026-11-08"), "1234_x_2026-11-08.md");
}

#[test]
fn parse_words_skips_blanks_and_comments() {
    let words = parse_words("# header\n\n  หลักสูตร  \ntuition\n");
    assert_eq!(words, vec!["หลักสูตร".to_string(), "tuition".to_string()]);
}

#[test]
fn scan_text_matches_case_insensitively_per_line_and_word() {
    let words = parse_words("Tuition\nคณะ\n");
    let hits = scan_text(Path::new("a.rs"), "let x = \"tuition\";\nfn คณะ() { TUITION }\nnothing", &words);
    let got: Vec<(usize, &str)> = hits.iter().map(|h| (h.line, h.word.as_str())).collect();
    assert_eq!(got, vec![(1, "Tuition"), (2, "Tuition"), (2, "คณะ")]);
}

#[test]
fn scan_rs_tree_walks_subdirs_and_ignores_other_files() {
    let root = temp_dir("scan");
    std::fs::create_dir_all(root.join("sub")).unwrap();
    std::fs::write(root.join("sub/deep.rs"), "const X: &str = \"คณะ\";").unwrap();
    std::fs::write(root.join("top.rs"), "clean").unwrap();
    std::fs::write(root.join("notes.md"), "คณะ").unwrap();
    let hits = scan_rs_tree(&root, &parse_words("คณะ")).expect("scan");
    assert_eq!(hits.len(), 1);
    assert!(hits[0].file.ends_with("sub/deep.rs"));
}

#[test]
fn report_accepts_only_when_every_gate_passes() {
    let all_pass: Vec<GateOutcome> = GateId::ALL.iter().map(|&g| GateOutcome::new(g, GateStatus::Pass, "ok")).collect();
    assert!(report::render("p", "2026-11-08", &all_pass).contains("ACCEPTED: every gate passed."));

    let mut one_skipped = all_pass.clone();
    one_skipped[3] = GateOutcome::new(GateId::ChatE2e, GateStatus::Skipped, "no Chrome");
    let text = report::render("p", "2026-11-08", &one_skipped);
    assert!(text.contains("NOT ACCEPTED"));
    assert!(text.contains("| 3b chat_e2e | SKIPPED | no Chrome |"));
}

#[test]
fn report_escapes_pipes_in_details() {
    let rows = [GateOutcome::new(GateId::EngineGeneric, GateStatus::Fail, "a|b\nc")];
    let text = report::render("p", "2026-11-08", &rows);
    assert!(text.contains("a\\|b ⏎ c"));
}

#[test]
fn engine_generic_passes_on_a_clean_tree_and_fails_on_a_hit() {
    let root = temp_dir("gate5");
    let src = root.join("crates/reflex-wasm/src");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::create_dir_all(root.join("crates/reflex-gate/words")).unwrap();
    std::fs::write(root.join("crates/reflex-gate/words/w.txt"), "คณะ\n").unwrap();
    std::fs::write(src.join("lib.rs"), "pub fn generic() {}\n").unwrap();
    let args = Args { pack: DEFAULT_PACK.into(), root: root.clone(), words: root.join("crates/reflex-gate/words/w.txt") };

    assert_eq!(runner::engine_generic(&args).status, GateStatus::Pass);

    std::fs::write(src.join("lib.rs"), "const FACULTY: &str = \"คณะ\";\n").unwrap();
    let failed = runner::engine_generic(&args);
    assert_eq!(failed.status, GateStatus::Fail);
    assert!(failed.detail.starts_with("1 hits"), "detail: {}", failed.detail);
}

#[test]
fn engine_generic_fails_when_word_list_is_missing() {
    let root = temp_dir("gate5-missing");
    let args = Args { pack: DEFAULT_PACK.into(), root: root.clone(), words: root.join("nope.txt") };
    assert_eq!(runner::engine_generic(&args).status, GateStatus::Fail);
}

#[test]
fn synth_eval_is_skipped_until_the_pack_has_a_synth_dir() {
    let root = temp_dir("gate4");
    let args = Args { pack: "stub".into(), root: root.clone(), words: PathBuf::new() };
    let skipped = runner::synth_eval(&args);
    assert_eq!(skipped.status, GateStatus::Skipped);
    assert!(skipped.detail.contains("not found"));

    std::fs::create_dir_all(root.join("packs/stub/synth")).unwrap();
    assert_eq!(runner::synth_eval(&args).status, GateStatus::Skipped, "still not measured, so never a pass");
}
