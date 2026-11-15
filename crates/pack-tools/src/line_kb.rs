//! The LINE worker's manual as an ES module (plan 019 item 6.2): `export const KB = [...]` from a site's `knowledge-index.json`, the
//! same fields and bytes as `scripts/gen_line_kb.mjs` writes for the Graduate School (`JSON.stringify(kb, null, 1)`), so one worker
//! source serves any agency's pack. `tests/line_kb.rs` checks the body against `integrations/line-worker/kb-data.mjs`.

use serde_json::Value;

/// The entry fields LINE uses, in output order (the same list as `scripts/gen_line_kb.mjs`).
pub const FIELDS: [&str; 11] = [
    "id",
    "title",
    "category",
    "keywords",
    "answer",
    "source_url",
    "faq_number",
    "approval_status",
    "steps",
    "academic_year",
    "semester",
];

/// Entries whose `approval_status` is not `"approved"` (a `--draft` index): the header then says the module is a preview.
pub fn unapproved(index: &[Value]) -> usize {
    index.iter().filter(|e| e.get("approval_status").and_then(Value::as_str) != Some("approved")).count()
}

/// The `agency.json` persona keys LINE's small talk reads (the page's `AGENCY.persona`).
pub const PERSONA_KEYS: [&str; 4] = ["hello", "bye", "whatCan", "howAreYou"];

/// How LINE speaks for an agency: `{persona, examples}` from its `agency.json` (only non-empty strings). `views.mjs` reads it as
/// `ctx.voice`: small talk says the agency's own lines, restart / overview name its example questions instead of the Graduate School's.
pub fn voice(agency: &Value) -> Value {
    let text = |v: Option<&Value>| v.and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let persona: serde_json::Map<String, Value> = PERSONA_KEYS
        .iter()
        .filter_map(|&k| text(agency.pointer(&format!("/persona/{k}"))).map(|s| (k.to_string(), Value::String(s))))
        .collect();
    let examples: Vec<Value> = agency
        .get("examples")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|e| text(e.get("q")).map(Value::String))
        .collect();
    serde_json::json!({ "persona": persona, "examples": examples })
}

/// The module text: two comment lines naming `source` and how to regenerate it, the KB body, and `LINE_VOICE` when `agency` is given.
pub fn render(index: &[Value], source: &str, agency: Option<&Value>) -> String {
    let scope = match unapproved(index) {
        0 => "approved-only".to_string(),
        n => format!("DRAFT: {n} entries not yet approved, preview only, never deploy"),
    };
    let flag = agency.map_or("", |_| " --agency <agency.json>");
    let voice_line = agency.map_or(String::new(), |a| format!("export const LINE_VOICE = {};\n", voice(a)));
    format!(
        "// AUTO-GENERATED from {source} ({scope}) — do not edit by hand.\n// Regenerate: cargo run -q -p pack-tools --bin pack-line-kb -- {source} <out.mjs>{flag}\n{}{voice_line}",
        body(index)
    )
}

/// `export const KB = [...];\n` with only the [`FIELDS`] that are set (no null, no empty string), as `JSON.stringify(kb, null, 1)`.
pub fn body(index: &[Value]) -> String {
    let kb: Vec<Vec<(&str, &Value)>> = index.iter().filter_map(Value::as_object).map(pick).collect();
    let mut out = String::from("export const KB = ");
    match kb.is_empty() {
        true => out.push_str("[]"),
        false => {
            out.push('[');
            for (i, entry) in kb.iter().enumerate() {
                sep(&mut out, i, 1);
                write_object(entry.iter().copied(), 1, &mut out);
            }
            pad(&mut out, 0);
            out.push(']');
        }
    }
    out.push_str(";\n");
    out
}

/// The set [`FIELDS`] of one entry, in [`FIELDS`] order (serde_json's own map would iterate its keys sorted).
fn pick(e: &serde_json::Map<String, Value>) -> Vec<(&'static str, &Value)> {
    FIELDS
        .iter()
        .filter_map(|&k| match e.get(k) {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) if s.is_empty() => None,
            Some(v) => Some((k, v)),
        })
        .collect()
}

fn pad(out: &mut String, depth: usize) {
    out.push('\n');
    out.extend(std::iter::repeat_n(' ', depth));
}

/// `,` before every item but the first, then the item's new line at `depth`.
fn sep(out: &mut String, i: usize, depth: usize) {
    if i > 0 {
        out.push(',');
    }
    pad(out, depth);
}

fn write_object<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a Value)>, depth: usize, out: &mut String) {
    let mut pairs = pairs.into_iter().peekable();
    if pairs.peek().is_none() {
        out.push_str("{}");
        return;
    }
    out.push('{');
    for (i, (k, v)) in pairs.enumerate() {
        sep(out, i, depth + 1);
        out.push_str(&Value::String(k.to_string()).to_string());
        out.push_str(": ");
        stringify(v, depth + 1, out);
    }
    pad(out, depth);
    out.push('}');
}

/// `JSON.stringify(v, null, 1)` of a value at nesting `depth`. A nested object's keys come out sorted (serde_json's map without
/// `preserve_order`); no LINE field holds one (`steps` is a list of strings).
fn stringify(v: &Value, depth: usize, out: &mut String) {
    match v {
        Value::Array(items) if !items.is_empty() => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                sep(out, i, depth + 1);
                stringify(item, depth + 1, out);
            }
            pad(out, depth);
            out.push(']');
        }
        Value::Object(map) => write_object(map.iter().map(|(k, v)| (k.as_str(), v)), depth, out),
        other => out.push_str(&other.to_string()),
    }
}
