//! A regex mask cannot find every personal detail (a bare Thai name has no marker). It removes the ones with a shape: emails,
//! Thai national ids (13 digits, any grouping), phone numbers (0x / +66), long digit runs and account ids, LINE ids after a label,
//! a name after a title (นาย / นาง / นางสาว / น.ส. / Mr / Mrs / Ms / Miss) or after "ชื่อ" / "นามสกุล". The chat note still asks
//! people not to type them.
use std::sync::OnceLock;

use regex_lite::Regex;

use super::types::PiiKind;

/// Thai letters and vowels (no digits, no punctuation).
const TH: &str = r"\x{0E01}-\x{0E4E}";

/// A rule masks its whole match, or only the named group `v` when it has one (the label before it stays readable for staff).
/// Order matters: the national id before the phone and digit-run rules, the LINE label before the account-id rule.
fn sources() -> [(PiiKind, String); 8] {
    [
        (PiiKind::Email, r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+".into()),
        (PiiKind::NationalId, r"\b\d[ -]?\d{4}[ -]?\d{5}[ -]?\d{2}[ -]?\d\b".into()),
        (PiiKind::Phone, r"(?:\+66[ -]?|\b0)\d(?:[ -]?\d){7,8}\b".into()),
        (PiiKind::LineId, r"(?i)(?:\bline\s*id|\bline\s*[:：]|ไอดีไลน์|ไลน์)\s*[:：]?\s*(?P<v>@?[A-Za-z0-9._-]{3,})".into()),
        (PiiKind::AccountId, r"\b(?:[A-Za-z]\d{6,}|\d{7,})\b".into()),
        (PiiKind::Name, format!(r"(?:ชื่อ(?:-?สกุล)?|นามสกุล)\s*[:：]?\s+(?P<v>[{TH}A-Za-z]+(?:\s+[{TH}A-Za-z]+)?)")),
        (PiiKind::Name, format!(r"(?:นางสาว|น\.ส\.|นาย|นาง)\s*[{TH}]+(?:\s+[{TH}]+)?")),
        (PiiKind::Name, r"\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?".into()),
    ]
}

/// After a title the next one or two Thai runs are masked: Thai has no word spaces, so without a surname the following word goes too
/// (over-masking is the safe side). Words that start with a title but are roles, not names, stay: "ติดต่อนายทะเบียน".
const NOT_NAMES: [&str; 7] = ["นายทะเบียน", "นายจ้าง", "นายก", "นายหน้า", "นายอำเภอ", "นางพยาบาล", "นางแบบ"];

fn rules() -> &'static [(PiiKind, Regex)] {
    static COMPILED: OnceLock<Vec<(PiiKind, Regex)>> = OnceLock::new();
    COMPILED.get_or_init(|| sources().into_iter().map(|(k, src)| (k, Regex::new(&src).expect("pii rule compiles"))).collect())
}

fn apply(text: &str, kind: PiiKind, re: &Regex) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for caps in re.captures_iter(text) {
        let whole = caps.get(0).expect("group 0 always matches");
        if kind == PiiKind::Name && NOT_NAMES.iter().any(|w| whole.as_str().starts_with(w)) {
            continue;
        }
        let span = caps.name("v").unwrap_or(whole);
        out.push_str(&text[last..span.start()]);
        out.push_str(kind.placeholder());
        last = span.end();
    }
    out.push_str(&text[last..]);
    out
}

pub fn mask_pii(text: &str) -> String {
    rules().iter().fold(text.to_string(), |acc, (kind, re)| apply(&acc, *kind, re))
}
