use super::patterns::patterns;
use super::types::Issue;
use crate::re::is_js_space;

/// Port of `classifyIssue(text)`: a personal/technical issue, or `None` for an ordinary knowledge question.
/// A few phrasings LOOK personal but are knowledge questions ("กี่วัน", "ค่าสอบ", "turnitin" ...): they stay on the manual.
pub fn classify_issue(text: &str) -> Option<Issue> {
    let p = patterns();
    if text.trim_matches(is_js_space).is_empty() || p.not_personal.is_match(text) {
        return None;
    }
    p.issues.iter().find(|(_, _, re)| re.is_match(text)).map(|(category, label, _)| Issue { kind: "personal", category, label })
}

/// Port of `isAdvice(q)`: open-ended advice ("แนะนำ", "วางแผน") is rephrase-worthy; a factual question (a number of days, baht,
/// people, a date) must stay exact and is never rephrased.
pub fn is_advice(q: &str) -> bool {
    let p = patterns();
    p.advice.is_match(q) && !p.factual.is_match(q)
}

/// Port of `isEnglish(q)`: Latin letters and no Thai letters (a Thai/English mix counts as Thai).
pub fn is_english(q: &str) -> bool {
    let has_thai = q.chars().any(|c| ('\u{e00}'..='\u{e7f}').contains(&c));
    let has_latin = q.chars().any(|c| c.is_ascii_alphabetic());
    has_latin && !has_thai
}
