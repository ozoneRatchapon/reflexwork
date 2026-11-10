//! reflex-wasm — the Reflex Kernel's routing core, compiled to WebAssembly.
//!
//! This is the SAME algorithm as `crates/reflex-kernel` (64-dim feature
//! encoding → sigmoid gate → seeded weights → BLAKE3 proof), with the
//! native-only parts (Solana, tokio, filesystem) left out so it runs entirely
//! in the browser with zero backend. A page can route a task and get a
//! reproducible BLAKE3 proof without any server round-trip.
//!
//! Build:  wasm-pack build --release --target web

pub mod answer;
pub mod catalogue;
pub mod decide;
pub mod intake;
/// The personal-data mask (its own crate so the workers load it without the search).
pub mod pii {
    pub use pii_mask::{mask_pii, PiiKind};
}
pub mod resolve;
mod kb_index;
mod re;
pub mod route;
pub mod understand;

pub use kb_index::KbIndex;
use blake3::Hasher;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const FEATURE_DIM: usize = 64;
const GATE_THRESHOLD: f32 = 0.72;

// ─── Category one-hot (mirrors TaskCategory::one_hot_index) ──────────────────

fn category_index(cat: &str) -> usize {
    match cat {
        "DocumentParse" => 0,
        "CodeGen" => 1,
        "DataQuery" => 2,
        "WorkflowOrchestration" => 3,
        "ComplianceCheck" => 4,
        "OnchainSettlement" => 5,
        "Research" => 6,
        _ => 7,
    }
}

// ─── Feature encoder (mirrors encoder.rs layout) ─────────────────────────────

fn encode(category: &str, input: &str, token_budget: u32, priority: u8) -> Vec<f32> {
    let mut x = vec![0.0f32; FEATURE_DIM];
    // [0..8] one-hot category
    x[category_index(category).min(7)] = 1.0;
    // [8] complexity (sigmoid of input length, blended with priority)
    let len = input.chars().count() as f32;
    let complexity = 1.0 / (1.0 + (-0.005 * (len - 500.0)).exp());
    let priority_norm = priority as f32 / 255.0;
    x[8] = (complexity * 0.7 + priority_norm * 0.3).clamp(0.0, 1.0);
    // [16] token budget fraction (ref 4096)
    x[16] = (token_budget as f32 / 4096.0).clamp(0.0, 1.0);
    // [24] deadline fraction (no deadline → 1.0)
    x[24] = 1.0;
    x
}

// ─── Seeded policy (mirrors policy::seed_default_weights) ─────────────────────

fn seeded_weights() -> (Vec<f32>, f32) {
    let mut w = vec![0.0f32; FEATURE_DIM];
    w[8] = 4.0; // complexity
    w[0] = 1.5; // DocumentParse → LLM
    w[1] = 1.2; // CodeGen
    w[2] = -2.0; // DataQuery → FastPath
    w[3] = 0.8; // WorkflowOrchestration
    w[4] = -1.5; // ComplianceCheck → FastPath
    w[6] = 2.0; // Research → LLM
    (w, -1.6)
}

fn seeded_multi() -> (Vec<f32>, Vec<f32>) {
    let k = 4;
    let mut mw = vec![0.0f32; k * FEATURE_DIM];
    let mut set = |class: usize, idx: usize, v: f32| mw[class * FEATURE_DIM + idx] = v;
    set(1, 8, 2.0);
    set(1, 4, 2.5);
    set(1, 6, 2.0); // McpAnalyze
    set(2, 8, 2.5);
    set(2, 0, 2.5);
    set(2, 3, 1.5); // McpSynthesize
    set(3, 16, -4.0); // Reject
    (mw, vec![0.0, 0.2, 0.2, -1.0])
}

fn sigmoid(z: f32) -> f32 {
    1.0 / (1.0 + (-z).exp())
}

fn softmax(logits: &mut [f32]) {
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let mut sum = 0.0;
    for l in logits.iter_mut() {
        *l = (*l - max).exp();
        sum += *l;
    }
    for l in logits.iter_mut() {
        *l /= sum;
    }
}

// ─── Routing (mirrors PolicyRouter::route) ───────────────────────────────────

// Thin wrapper used by unit tests; the public path uses route_with_gate.
#[allow(dead_code)]
fn route(x: &[f32]) -> &'static str {
    route_with_gate(x).0
}

/// Like `route`, but also returns the raw sigmoid gate score `g` ∈ [0,1].
/// Exposing `g` lets the JS rethink layer act on the real confidence instead of
/// a proxy derived from `fast_path` + the complexity feature.
fn route_with_gate(x: &[f32]) -> (&'static str, f32) {
    let (w, b) = seeded_weights();
    let dot: f32 = w.iter().zip(x).map(|(wi, xi)| wi * xi).sum();
    let g = sigmoid(dot + b);
    if g < GATE_THRESHOLD * 0.55 {
        return ("FastPath", g);
    }
    if g >= GATE_THRESHOLD {
        let (mw, mb) = seeded_multi();
        let mut logits = vec![0.0f32; 4];
        for c in 0..4 {
            let row = c * FEATURE_DIM;
            logits[c] = mw[row..row + FEATURE_DIM]
                .iter()
                .zip(x)
                .map(|(wi, xi)| wi * xi)
                .sum::<f32>()
                + mb[c];
        }
        softmax(&mut logits);
        let best = logits
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap_or(0);
        let r = match best {
            1 => "McpAnalyze",
            2 => "McpSynthesize",
            3 => "Rejected",
            _ => "McpAnalyze",
        };
        return (r, g);
    }
    ("FastPath", g)
}

// ─── BLAKE3 proof (mirrors attestation composite hash) ───────────────────────

fn blake3_hex(bytes: &[u8]) -> [u8; 32] {
    let mut h = Hasher::new();
    h.update(bytes);
    *h.finalize().as_bytes()
}

// ─── Public wasm-bindgen API ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct RouteOutput {
    pub route: String,
    pub fast_path: bool,
    pub blake3_proof: String,
    pub token_cost: String,
    pub gate_dim8_complexity: f32,
    /// Raw sigmoid gate score g ∈ [0,1] (higher = more "needs LLM").
    pub gate_score: f32,
}

/// BLAKE3 of the UTF-8 bytes of `text`, as 64 hex chars. The page builds the answer receipt from it: the preimage (question, route, served
/// entry id + content, hash of the whole manual) is assembled in JS, hashed here, so one implementation hashes everything in the browser.
#[wasm_bindgen]
pub fn blake3_text(text: &str) -> String {
    hex_encode(&blake3_hex(text.as_bytes()))
}

/// Route one task entirely in the browser. Returns a JSON object with the
/// decision + a reproducible BLAKE3 proof — no backend, no token cost on the
/// fast path. Mirrors the native Rust kernel's decision exactly.
#[wasm_bindgen]
pub fn route_task(category: &str, input: &str, token_budget: u32, priority: u8) -> JsValue {
    let x = encode(category, input, token_budget, priority);
    let (decision, gate_score) = route_with_gate(&x);
    let fast_path = decision == "FastPath";

    // composite proof = BLAKE3( input_bytes || route_bytes )
    let mut buf = Vec::new();
    buf.extend_from_slice(input.as_bytes());
    buf.extend_from_slice(decision.as_bytes());
    buf.extend_from_slice(category.as_bytes());
    let proof = blake3_hex(&buf);

    let out = RouteOutput {
        route: decision.to_string(),
        fast_path,
        blake3_proof: hex_encode(&proof),
        token_cost: if fast_path {
            "0 tokens (deterministic — no LLM)".into()
        } else {
            "budgeted (LLM path via Kiro MCP)".into()
        },
        gate_dim8_complexity: x[8],
        gate_score,
    };
    serde_wasm_bindgen::to_value(&out).unwrap()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ─── KB retrieval: hybrid lexical + vector (TF-IDF cosine); no neural model ──
// Single source of truth for the chatbot's search(), ported from the JS PoC
// winner (recall@1 80% / @3 96% on the 50-case eval). TF-IDF cosine over char
// n-grams + tokens is the PRIMARY ranker (IDF makes rare meaning-bearing grams
// dominate → paraphrase/typo/EN match); lexical overlap is a tiebreak. 0 token,
// deterministic, auditable — latent is the MATCHER, never the fact source.

/// char-trigrams + space tokens (len>1), lowercased. Mirrors the JS _gramSet. Public for the offline benches (crates/reflex-bench).
pub fn gram_set(text: &str) -> Vec<String> {
    let s = text.to_lowercase();
    let mut set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for tok in s.split_whitespace() {
        if tok.chars().count() > 1 {
            set.insert(tok.to_string());
        }
    }
    let chars: Vec<char> = s.chars().collect();
    if chars.len() >= 3 {
        for i in 0..=chars.len() - 3 {
            let g: String = chars[i..i + 3].iter().collect();
            let t = g.trim();
            if t.chars().count() == 3 {
                set.insert(t.to_string());
            }
        }
    }
    set.into_iter().collect()
}

/// Question-form words say HOW a student asks, never WHAT about; left in, their trigrams matched unrelated entries.
/// Stripped from the QUERY only. Lockstep with chatbot.html `_stripQ` (same list, same alternation order = leftmost, first listed wins).
const QUERY_FILLERS: [&str; 17] = [
    "เท่าไหร่", "เท่าไร", "เท่าใด", "คืออะไร", "อะไรบ้าง", "ได้ไหม", "ได้มั้ย", "หรือไม่", "นะครับ",
    "นะคะ", "ครับ", "ค่ะ", "คะ", "บ้าง", "หน่อย", "ไหม", "มั้ย",
];

pub(crate) fn strip_query_fillers(q: &str) -> String {
    let chars: Vec<char> = q.chars().collect();
    let fillers: Vec<Vec<char>> = QUERY_FILLERS.iter().map(|f| f.chars().collect()).collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        match fillers.iter().find(|f| chars[i..].starts_with(f)) {
            Some(f) => {
                out.push(' ');
                i += f.len();
            }
            None => {
                out.push(chars[i]);
                i += 1;
            }
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    match collapsed.is_empty() {
        true => q.to_string(),
        false => collapsed,
    }
}

#[derive(Deserialize)]
pub struct KbEntryIn {
    pub id: String,
    pub keywords: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct KbHit {
    pub id: String,
    /// integer gate score (preserves decideTier's s>=4 / s>=6 contract)
    pub s: i32,
    pub cos: f32,
    pub overlap: i32,
}

/// Lexical overlap may only RAISE a candidate the vector already supports: below this cosine (= the lowest
/// tier that answers at all, s=3) a pile of shared n-grams proves nothing. Measured 2026-11-03 on hand-written
/// out-of-scope questions: without this floor, generic question words ("คืออะไร", "ได้ไหม") lifted candidates
/// with cosine 0.11 to s=5-6 and 25% (English) / 39% (Thai) of such questions were answered with an unrelated
/// entry; with it, 13% / 17%, and no question the manual covers lost its answer (docs/METHOD.md section 5 F).
const OVERLAP_LIFT_MIN_COS: f32 = 0.15;

/// cosine + lexical overlap → integer gate score (a blend of the vector and the lexical signal).
/// Cosine alone under-scores entries with LONG keyword lists (TF-IDF norm divides
/// by a big vector), so a clearly-dominant lexical match like "Turnitin เกิน 25%"
/// → thesis_turnitin (overlap 15, cosine only 0.20 because the entry has 20+
/// keywords) was landing at s=3 (disambiguate) despite being obviously right.
/// We lift the score when the lexical signal is strong AND the cosine is at least
/// `OVERLAP_LIFT_MIN_COS`: high overlap with a clear overlap lead over the runner-up
/// means "confident", even if the cosine is diluted.
/// `margin` = cosine gap; `ov`/`ov_lead` = overlap + lead.
pub(crate) fn cos_to_score(c: f32, margin: f32, ov: i32, ov_lead: i32) -> i32 {
    // strong lexical match with a clear lead (and some vector support) → humanize-grade
    if c >= OVERLAP_LIFT_MIN_COS && ov >= 8 && ov_lead >= 4 {
        return 6;
    }
    if c >= OVERLAP_LIFT_MIN_COS && ov >= 5 && ov_lead >= 2 {
        return 5;
    }
    // otherwise fall back to the calibrated cosine tiers (+ margin for the top)
    if c >= 0.40 && margin >= 0.08 {
        6
    } else if c >= 0.30 {
        5
    } else if c >= 0.20 {
        4
    } else if c >= 0.15 {
        3
    } else {
        ((c * 10.0).round() as i32).max(1)
    }
}

/// The gate score of one ranked row, for the page's staff-supersede step (it re-scores the new top against the new runner-up).
#[wasm_bindgen(js_name = cos_to_score)]
pub fn kb_row_score(cos: f32, margin: f32, overlap: i32, overlap_lead: i32) -> i32 {
    cos_to_score(cos, margin, overlap, overlap_lead)
}

/// Search a KB (passed as `[{id, keywords}]` JSON) for `query`. Returns a ranked
/// `[{id, s, cos, overlap}]`. The KB is small (tens–hundreds of entries) so a
/// per-call IDF build is microseconds; no caching needed across the wasm boundary.
#[wasm_bindgen]
pub fn kb_search(kb: JsValue, query: &str) -> JsValue {
    let entries: Vec<KbEntryIn> = match serde_wasm_bindgen::from_value(kb) {
        Ok(v) => v,
        Err(_) => return serde_wasm_bindgen::to_value(&Vec::<KbHit>::new()).unwrap(),
    };
    serde_wasm_bindgen::to_value(&kb_rank(&entries, query)).unwrap()
}

/// The ranking behind `kb_search`, callable from Rust. Builds the index for one search; a caller that searches the same
/// entries again should keep a `KbIndex` (`route::Manual` does).
pub fn kb_rank(entries: &[KbEntryIn], query: &str) -> Vec<KbHit> {
    KbIndex::new(entries).rank(query)
}

// ─── Smalltalk intent scorer: sigmoid-gated, signed weights (never softmax) ──
// Single source of truth for the chatbot's classifySmalltalk(), ported from
// _shared/smalltalk.mjs. Feature vector → per-intent dot → sigmoid gate → argmax.
// Negation is a RESISTING feature, not a guard clause. Deterministic, 0 token.

fn feat_vec(q: &str) -> [f32; 8] {
    // [greet, thanks, praise, bye, whatcan, howareyou, question, neg]
    let has = |re: &[&str]| re.iter().any(|p| q.contains(p));
    let lower = q.to_lowercase();
    let starts = |re: &[&str]| re.iter().any(|p| lower.starts_with(p) || q.starts_with(p));
    let greet = starts(&["สวัสดี", "หวัดดี", "ดีครับ", "ดีค่ะ", "hello", "hi", "hey", "ฮัลโหล", "โย่", "ทัก"]);
    let thanks = has(&["ขอบคุณ", "ขอบใจ", "thank", "thx"]);
    let praise = has(&["เยี่ยม", "สุดยอด", "เก่งมาก", "เก่งจัง", "ฉลาด", "ดีจัง", "great job", "awesome", "well done"]);
    let bye = starts(&["บาย", "ลาก่อน", "ไปละ", "แค่นี้", "bye", "goodbye", "โอเคครับ", "โอเคค่ะ"]);
    let whatcan = has(&["ทำอะไรได้", "ช่วยอะไรได้", "คุณคือใคร", "คุณเป็นใคร", "ใช้ยังไง", "นี่คืออะไร", "what can you", "who are you"]);
    let howareyou = has(&["สบายดีไหม", "สบายดีมั้ย", "เป็นไงบ้าง", "เป็นยังไงบ้าง", "how are you"]);
    let question = has(&["?", "กี่", "เท่าไร", "อย่างไร", "ยังไง", "ทำไม", "วิธี", "ขั้นตอน", "turnitin", "ลงทะเบียน", "วิทยานิพนธ์", "สอบ", "ค่า"]);
    // negation / complaint (incl. ironic praise) — บ้า(?!ง) via explicit check
    let neg = has(&["ไม่ช่วย", "ไม่ได้", "ไม่เห็น", "ไม่รู้", "ไม่เข้าใจ", "ไม่ตรง", "ไม่โอเค", "ไม่มีประโยชน์",
        "ไม่เอา", "ไม่ไหว", "ผิด", "มั่ว", "พัง", "เสียเวลา", "เสียดาย", "ห่วย", "แย่", "โง่", "งี่เง่า",
        "กาก", "ไร้สาระ", "น่าเบื่อ", "useless", "worthless", "terrible", "awful", "waste of",
        "doesn't work", "doesnt work", "didn't help", "didnt help", "not helpful", "not working", "no help"])
        || (q.contains("บ้า") && !q.contains("บ้าง"));
    [
        greet as i32 as f32,
        thanks as i32 as f32,
        praise as i32 as f32,
        bye as i32 as f32,
        whatcan as i32 as f32,
        howareyou as i32 as f32,
        question as i32 as f32,
        neg as i32 as f32,
    ]
}

/// Classify a message as smalltalk. Returns the intent kind ("greet"/"thanks"/
/// "bye"/"whatcan"/"howareyou") or an empty string when it is NOT smalltalk
/// (a real question / complaint → kernel path). Sigmoid gate, argmax over gate.
#[wasm_bindgen]
pub fn classify_smalltalk(text: &str) -> String {
    let q = text.trim();
    if q.is_empty() {
        return String::new();
    }
    // Greeting-strip: "สวัสดี ค่าสอบเท่าไร" → strip the leading greeting and, if the
    // remainder carries a question signal, treat the whole thing as a question
    // (not a greeting). Mirrors the JS scorer's `probeOn`.
    let lower = q.to_lowercase();
    let mut stripped = q.to_string();
    for p in ["สวัสดี", "หวัดดี", "ดีครับ", "ดีค่ะ", "hello", "hi", "hey"] {
        if lower.starts_with(p) || q.starts_with(p) {
            stripped = q[q.find(p).map(|i| i + p.len()).unwrap_or(0)..]
                .trim_start_matches([' ', ','])
                .to_string();
            break;
        }
    }
    let q_signal = ["?", "กี่", "เท่าไร", "อย่างไร", "ยังไง", "ทำไม", "วิธี", "ขั้นตอน", "turnitin", "ลงทะเบียน", "วิทยานิพนธ์", "สอบ", "ค่า"]
        .iter()
        .any(|p| stripped.contains(p));
    let probe = if stripped.chars().count() > 3 && q_signal { stripped.as_str() } else { q };

    let f = feat_vec(probe);
    // per-intent signed weight rows over [greet,thanks,praise,bye,whatcan,howareyou,question,neg]
    let rows: [(&str, [f32; 8]); 5] = [
        ("greet", [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.9, 0.0]),
        ("thanks", [0.0, 1.0, 0.7, 0.0, 0.0, 0.0, -0.5, -1.6]),
        ("howareyou", [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, -0.5, -1.6]),
        ("whatcan", [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -0.3, -1.6]),
        ("bye", [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -0.9, 0.0]),
    ];
    const TAU: f32 = 0.6;
    const GATE: f32 = 0.5;
    let mut best: Option<(&str, f32)> = None;
    for (kind, w) in rows.iter() {
        let dot: f32 = w.iter().zip(f.iter()).map(|(wi, xi)| wi * xi).sum();
        let gate = 1.0 / (1.0 + (-dot / TAU).exp());
        if gate > GATE && best.map(|(_, s)| gate > s).unwrap_or(true) {
            best = Some((kind, gate));
        }
    }
    best.map(|(k, _)| k.to_string()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_dataquery_is_fastpath() {
        let x = encode("DataQuery", "count rows", 2048, 128);
        assert_eq!(route(&x), "FastPath");
    }

    #[test]
    fn long_research_hits_llm() {
        let long = "investigate and synthesize ".repeat(40);
        let x = encode("Research", &long, 2048, 128);
        assert_eq!(route(&x), "McpAnalyze");
    }

    #[test]
    fn long_document_synthesizes() {
        let long = "parse this long scanned petition document ".repeat(40);
        let x = encode("DocumentParse", &long, 2048, 128);
        assert_eq!(route(&x), "McpSynthesize");
    }

    #[test]
    fn blake3_text_matches_known_vectors() {
        // the same strings hashed by integrations/kernel-worker/vendor/blake3.js (JS), so the page and the worker agree
        assert_eq!(blake3_text(""), "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
        assert_eq!(blake3_text("abc"), "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
        assert_eq!(blake3_text("ค่าเทอม"), "056513f6f449905ab98cf0274fcf215922b1bf4a1b2e8525be3bf5c535030c23");
    }

    #[test]
    fn proof_is_reproducible() {
        let a = blake3_hex(b"same input");
        let b = blake3_hex(b"same input");
        assert_eq!(a, b);
    }

    // ─── smalltalk scorer ────────────────────────────────────────────────────
    #[test]
    fn greeting_classifies() {
        assert_eq!(classify_smalltalk("สวัสดีครับ"), "greet");
        assert_eq!(classify_smalltalk("hello"), "greet");
    }

    #[test]
    fn genuine_thanks_classifies() {
        assert_eq!(classify_smalltalk("ขอบคุณมากครับ"), "thanks");
    }

    #[test]
    fn sarcastic_thanks_falls_through() {
        // "thanks for not helping at all" → NOT genuine → empty (kernel path)
        assert_eq!(classify_smalltalk("ขอบคุณที่ไม่ช่วยอะไรเลย"), "");
        assert_eq!(classify_smalltalk("thanks a lot, you were useless"), "");
    }

    #[test]
    fn whatcan_not_tripped_by_complaint() {
        // "ทำอะไรได้บ้าง" must classify; "บ้า" inside "บ้าง" must NOT fire neg
        assert_eq!(classify_smalltalk("ทำอะไรได้บ้าง"), "whatcan");
    }

    #[test]
    fn real_question_is_not_smalltalk() {
        assert_eq!(classify_smalltalk("ค่าสอบเท่าไร"), "");
        assert_eq!(classify_smalltalk("สวัสดีครับ ค่าสอบเท่าไร"), "");
    }

    // ─── kb_search gram helper ───────────────────────────────────────────────
    #[test]
    fn strip_query_fillers_matches_js() {
        assert_eq!(strip_query_fillers("ค่าสมัครเรียนเท่าไหร่ครับ"), "ค่าสมัครเรียน");
        assert_eq!(strip_query_fillers("ครับ"), "ครับ");
        assert_eq!(strip_query_fillers("ต้องใช้ APA ไหมในวิทยานิพนธ์"), "ต้องใช้ APA ในวิทยานิพนธ์");
    }

    #[test]
    fn gram_set_is_deterministic() {
        assert_eq!(gram_set("ค่าสอบเท่าไร"), gram_set("ค่าสอบเท่าไร"));
    }

    #[test]
    fn cos_to_score_calibration() {
        // strong symbolic overlap lifts the score even with diluted cosine
        assert_eq!(cos_to_score(0.20, 0.02, 15, 8), 6); // the Turnitin case
        assert_eq!(cos_to_score(0.18, 0.01, 6, 2), 5); // moderate overlap lead
        // cosine tiers when overlap is weak
        assert_eq!(cos_to_score(0.45, 0.10, 2, 1), 6); // strong cosine + clear winner
        assert_eq!(cos_to_score(0.45, 0.02, 2, 1), 5); // strong cosine but near-tie
        assert_eq!(cos_to_score(0.25, 0.0, 2, 1), 4); // clears gate
        assert_eq!(cos_to_score(0.10, 0.0, 1, 0), 1); // weak
    }
}

/// Serialise for JS the way the page's own functions return values: `None` is `null` (not `undefined`), also inside objects.
fn to_js<T: serde::Serialize>(v: &T) -> JsValue {
    v.serialize(&serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true)).unwrap_or(JsValue::NULL)
}

// ─── Answer formatting (.plans/002 step 1; contract: benchmark/golden/answer_points.json) ─────────────────────

/// The manual's own words cut into short points (port of chatbot.html `answerPoints`).
#[wasm_bindgen]
pub fn answer_points(body: &str) -> JsValue {
    to_js(&answer::answer_points(body))
}

/// The number a question asks for, taken from the answer (port of chatbot.html `slotLead`); "" when none.
#[wasm_bindgen]
pub fn slot_lead(answer: &str, question: &str) -> String {
    answer::slot_lead(answer, question)
}

/// What to do after the search: `{action: "act"|"disambiguate"|"escalate", stage: "reflex"|"rethink"}` (port of `decideTier`).
/// `gate` may be NaN when the kernel gave no gate score.
#[wasm_bindgen]
pub fn decide_tier(gate: f64, scores: Vec<f64>) -> JsValue {
    let g = (!gate.is_nan()).then_some(gate);
    to_js(&decide::decide_tier(g, &scores))
}

/// Admission schedule of one programme as `{cols, rows, notes, list}` (port of `_pSchedule`, data part).
#[wasm_bindgen]
pub fn schedule_table(lines: Vec<String>) -> JsValue {
    to_js(&catalogue::schedule_table(&lines))
}

/// Fee table of one programme as `{rows, notes}` (port of `_pFee`).
#[wasm_bindgen]
pub fn fee_table(lines: Vec<String>) -> JsValue {
    to_js(&catalogue::fee_table(&lines))
}

/// The programme catalogue, indexed once, so each question only pays for matching (port of `resolveProgramme`).
#[wasm_bindgen]
pub struct Resolver {
    inner: resolve::Catalogue,
}

#[wasm_bindgen]
impl Resolver {
    /// `programmes`: the `programmes` array of programmes.json.
    #[wasm_bindgen(constructor)]
    pub fn new(programmes: JsValue) -> Result<Resolver, JsValue> {
        let rows: Vec<resolve::Programme> = serde_wasm_bindgen::from_value(programmes)?;
        Ok(Resolver { inner: resolve::Catalogue::new(&rows) })
    }

    /// `{kind: "one"|"many"|"broad", codes, topic, via, levelMissing, total}` or `null`. `loose` = nearest names only.
    pub fn resolve(&self, q: &str, loose: bool) -> JsValue {
        to_js(&self.inner.resolve(q, loose))
    }
}

/// The whole chat decision order (plan 009). Built from the page's manual rows and programme rows (or null when there is no
/// catalogue), then asked one question at a time. `decide` returns the route name or `null` (= the page's "not found" path).
#[wasm_bindgen]
pub struct Router {
    manual: route::Manual,
    catalogue: Option<resolve::Catalogue>,
}

#[wasm_bindgen]
impl Router {
    /// `kb`: the manual rows (array); `programmes`: the programme rows (array) or null; `vocab`: a pack's vocab.json text, or omitted
    /// for the embedded graduate-school pack (install happens once per process, before any route call).
    #[wasm_bindgen(constructor)]
    pub fn new(kb: JsValue, programmes: JsValue, vocab: Option<String>) -> Result<Router, JsValue> {
        if let Some(json) = vocab {
            route::vocab::install(&json).map_err(|e| JsValue::from_str(&e))?;
        }
        let rows: Vec<route::router::KbIn> = serde_wasm_bindgen::from_value(kb)?;
        let catalogue = match programmes.is_null() || programmes.is_undefined() {
            true => None,
            false => {
                let rows: Vec<resolve::Programme> = serde_wasm_bindgen::from_value(programmes)?;
                Some(resolve::Catalogue::new(&rows))
            }
        };
        Ok(Router { manual: route::router::manual_from(rows), catalogue })
    }

    /// `state`: `{progState, aiOff, pinnedId, programmeInFocus, today, agencyHasIt}`; `rewrite`: the AI's phrases (array) or null.
    /// Returns the route name, or `null` for the page's "not found" path.
    pub fn decide(&self, q: &str, state: JsValue, rewrite: JsValue) -> Result<JsValue, JsValue> {
        let d = self.decide_in(q, state, rewrite)?;
        Ok(d.route.map_or(JsValue::NULL, JsValue::from_str))
    }

    /// Same arguments as `decide`. Returns `{route, personal, stuck: {key, picks, areas}, programme, aspect, timeIntent, studyIntent}`:
    /// the route (or `null`) and what its view needs; fields a route does not use are `null` (plan 015 step 4c).
    pub fn decision(&self, q: &str, state: JsValue, rewrite: JsValue) -> Result<JsValue, JsValue> {
        Ok(to_js(&self.decide_in(q, state, rewrite)?))
    }

    /// The manual's search over the question as `decide` reads it (prepared the same way, the same index): `[{id, s}]`, best first, at most
    /// `n`. For a client without a search of its own (the LINE worker's "nearest topics").
    pub fn search(&self, q: &str, n: usize) -> JsValue {
        #[derive(Serialize)]
        struct Hit<'a> {
            id: &'a str,
            s: i32,
        }
        let q = route::prepare(q);
        let hits: Vec<Hit> = self.manual.search(&q).into_iter().take(n).map(|f| Hit { id: &f.entry.id, s: f.hit.s }).collect();
        to_js(&hits)
    }
}

impl Router {
    fn decide_in(&self, q: &str, state: JsValue, rewrite: JsValue) -> Result<route::detail::Decision, JsValue> {
        let state: route::router::StateIn = serde_wasm_bindgen::from_value(state)?;
        let phrases: Option<Vec<String>> = match rewrite.is_null() || rewrite.is_undefined() {
            true => None,
            false => Some(serde_wasm_bindgen::from_value(rewrite)?),
        };
        route::router::decide(q, &state, &self.manual, self.catalogue.as_ref(), phrases.as_deref()).map_err(|e| JsValue::from_str(&e))
    }
}

/// Verify the phrases an AI wrote: `results[i]` = the search result of `phrases[i]` as `[{id, s}]` (best first, 3 are enough).
/// Returns `{kind: "one", id, score, via, others}`, `{kind: "many", ids}` or `{kind: "none"}` (port of `understand`).
#[wasm_bindgen]
pub fn understand(phrases: Vec<String>, results: JsValue) -> JsValue {
    let rows: Vec<Vec<understand::Hit>> = serde_wasm_bindgen::from_value(results).unwrap_or_default();
    to_js(&understand::understand(&phrases, &rows))
}

/// `{kind: "personal", category, label}` for a personal/technical issue that needs staff, else `null` (port of `classifyIssue`).
#[wasm_bindgen]
pub fn classify_issue(text: &str) -> JsValue {
    to_js(&intake::classify_issue(text))
}

/// Open-ended advice question (rephrase-worthy), not a factual lookup (port of `isAdvice`).
#[wasm_bindgen]
pub fn is_advice(q: &str) -> bool {
    intake::is_advice(q)
}

/// Latin letters and no Thai letters (port of `isEnglish`).
#[wasm_bindgen]
pub fn is_english(q: &str) -> bool {
    intake::is_english(q)
}

/// Question text with emails, national ids, phones, account ids, LINE ids and titled names replaced by placeholders.
/// The page sends only this to the AI proxy and the gap list (PDPA check 2026-11-09, `docs/pdpa-check.md`).
#[wasm_bindgen]
pub fn mask_pii(text: &str) -> String {
    pii::mask_pii(text)
}
