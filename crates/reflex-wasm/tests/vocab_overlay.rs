//! Plan 019 step 3.1: a pack's vocab.json lists only the keys it changes; the rest come from the embedded graduate-school default.
//! Run: cargo test -p reflex-wasm --test vocab_overlay
use reflex_wasm::route::vocab::{parse, vocab};

#[test]
fn an_empty_pack_is_the_default() {
    let v = parse("{}").unwrap();
    let d = vocab();
    assert_eq!(v.round_th.src, d.round_th.src);
    assert_eq!(v.words.round_first, d.words.round_first);
    assert_eq!(v.stuck_cats.len(), d.stuck_cats.len());
}

#[test]
fn a_pack_changes_only_the_keys_it_gives() {
    let v = parse(r#"{"words": {"round_first": "รอบที่หนึ่ง"}, "round_in_title": {"src": "รอบ(?:ที่)?\\s*(\\d)", "flags": ""}}"#).unwrap();
    let d = vocab();
    assert_eq!(v.words.round_first, "รอบที่หนึ่ง");
    assert_eq!(v.words.term_first, d.words.term_first, "a sibling word keeps the default");
    assert_eq!(v.round_in_title.src, r"รอบ(?:ที่)?\s*(\d)");
    assert_eq!(v.round_th.src, d.round_th.src, "an untouched pattern keeps the default");
}

#[test]
fn an_unknown_key_fails_with_its_path() {
    let e = parse(r#"{"words": {"round_frist": "x"}}"#).err().unwrap();
    assert!(e.contains("words.round_frist"), "{e}");
    let e = parse(r#"{"no_such_pattern": {"src": "a", "flags": ""}}"#).err().unwrap();
    assert!(e.contains("no_such_pattern"), "{e}");
}

#[test]
fn a_pattern_is_replaced_whole() {
    // `src` without `flags` must not keep the default's flags behind the pack's back
    let e = parse(r#"{"round_en": {"src": "round\\s*(\\d)"}}"#).err().unwrap();
    assert!(e.contains("flags"), "{e}");
    assert!(parse(r#"{"words": "x"}"#).is_err());
    assert!(parse("[]").is_err());
}

#[test]
fn check_compiles_every_pattern_and_names_the_bad_one() {
    use reflex_wasm::route::vocab::check;
    assert!(check("{}").is_ok(), "the default compiles: {:?}", check("{}").err());
    // the lead pattern is checked after the engine's own lookahead rewrite; a pack that drops a ported lookahead is told so
    let e = check(r#"{"resolve": {"lead": {"src": "^(?:ขอ)?", "flags": "i"}}}"#).err().unwrap();
    assert!(e.contains("resolve.lead") && e.contains("port it again"), "{e}");
    let e = check(r#"{"round_th": {"src": "รอบ(", "flags": ""}}"#).err().unwrap();
    assert!(e.contains("round_th") && e.contains("does not compile"), "{e}");
    // a construct the JS-to-Rust translation does not cover is reported, not panicked on
    let e = check(r#"{"round_en": {"src": "[\\b]", "flags": ""}}"#).err().unwrap();
    assert!(e.contains("round_en") && e.contains("not ported"), "{e}");
    // parse alone does not compile
    assert!(parse(r#"{"round_th": {"src": "รอบ(", "flags": ""}}"#).is_ok());
}
