//! Plan 019 item 6.2: `pack-line-kb` writes the LINE manual byte for byte as `scripts/gen_line_kb.mjs` does, so a pack's LINE worker
//! and the Graduate School's run the same code on the same shape.

use pack_tools::line_kb::{body, render, unapproved, voice};
use serde_json::{json, Value};

fn repo(path: &str) -> String {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
    std::fs::read_to_string(format!("{root}/{path}")).unwrap_or_else(|e| panic!("{path}: {e}"))
}

#[test]
fn body_matches_the_graduate_school_copy() {
    let index: Vec<Value> = serde_json::from_str(&repo("submissions/ui/knowledge-index.json")).unwrap();
    let kb = repo("integrations/line-worker/kb-data.mjs");
    let (_, committed) = kb.split_once("export const KB = ").expect("kb-data.mjs has the KB export");
    assert_eq!(body(&index), format!("export const KB = {committed}"), "run node scripts/gen_line_kb.mjs if kb-data.mjs is stale");
}

#[test]
fn keeps_field_order_and_drops_empty_fields() {
    let index = vec![json!({"semester": "1", "id": "a", "title": "T", "keywords": "", "answer": null, "extra": "x",
        "steps": ["s1", "s\"2"], "approval_status": "approved"})];
    let want = "export const KB = [\n {\n  \"id\": \"a\",\n  \"title\": \"T\",\n  \"approval_status\": \"approved\",\n  \"steps\": [\n   \"s1\",\n   \"s\\\"2\"\n  ],\n  \"semester\": \"1\"\n }\n];\n";
    assert_eq!(body(&index), want);
    assert_eq!(body(&[]), "export const KB = [];\n");
}

#[test]
fn header_marks_a_draft_index() {
    let draft = vec![json!({"id": "a", "approval_status": "draft"}), json!({"id": "b", "approval_status": "approved"})];
    assert_eq!(unapproved(&draft), 1);
    assert!(render(&draft, "x.json", None).lines().next().unwrap().contains("DRAFT: 1 entries not yet approved"));
    assert!(render(&draft[1..], "x.json", None).starts_with("// AUTO-GENERATED from x.json (approved-only)"));
}

#[test]
fn voice_keeps_only_the_agency_lines_it_sets() {
    let agency = json!({"persona": {"hello": " สวัสดี ", "bye": "", "extra": "x"}, "examples": [{"q": "a"}, {"q": " "}, {"ai": true}, {"q": "b"}]});
    assert_eq!(voice(&agency), json!({"persona": {"hello": "สวัสดี"}, "examples": ["a", "b"]}));
    let module = render(&[], "i.json", Some(&agency));
    assert!(module.ends_with("export const KB = [];\nexport const LINE_VOICE = {\"examples\":[\"a\",\"b\"],\"persona\":{\"hello\":\"สวัสดี\"}};\n"), "{module}");
    assert!(module.contains("--agency <agency.json>"));
}
