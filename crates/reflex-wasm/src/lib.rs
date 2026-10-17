//! reflex-wasm — the Reflex Kernel's routing core, compiled to WebAssembly.
//!
//! This is the SAME algorithm as `crates/reflex-kernel` (64-dim feature
//! encoding → sigmoid gate → seeded weights → BLAKE3 proof), with the
//! native-only parts (Solana, tokio, filesystem) left out so it runs entirely
//! in the browser with zero backend. A page can route a task and get a
//! reproducible BLAKE3 proof without any server round-trip.
//!
//! Build:  wasm-pack build --release --target web

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

// ─── KB retrieval: neurosymbolic TF-IDF cosine (modelless "latent") ──────────
// Single source of truth for the chatbot's search(), ported from the JS PoC
// winner (recall@1 80% / @3 96% on the 50-case eval). TF-IDF cosine over char
// n-grams + tokens is the PRIMARY ranker (IDF makes rare meaning-bearing grams
// dominate → paraphrase/typo/EN match); lexical overlap is a tiebreak. 0 token,
// deterministic, auditable — latent is the MATCHER, never the fact source.

/// char-trigrams + space tokens (len>1), lowercased. Mirrors the JS _gramSet.
fn gram_set(text: &str) -> Vec<String> {
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

#[derive(Deserialize)]
struct KbEntryIn {
    id: String,
    keywords: String,
}

#[derive(Serialize)]
struct KbHit {
    id: String,
    /// integer gate score (preserves decideTier's s>=4 / s>=6 contract)
    s: i32,
    cos: f32,
    overlap: i32,
}

/// cosine + lexical overlap → integer gate score (the neurosymbolic blend).
/// Cosine alone under-scores entries with LONG keyword lists (TF-IDF norm divides
/// by a big vector), so a clearly-dominant lexical match like "Turnitin เกิน 25%"
/// → thesis_turnitin (overlap 15, cosine only 0.20 because the entry has 20+
/// keywords) was landing at s=3 (disambiguate) despite being obviously right.
/// We lift the score when the SYMBOLIC signal is strong: high overlap AND a clear
/// overlap lead over the runner-up means "confident", even if the sub-symbolic
/// cosine is diluted. `margin` = cosine gap; `ov`/`ov_lead` = overlap + lead.
fn cos_to_score(c: f32, margin: f32, ov: i32, ov_lead: i32) -> i32 {
    // strong symbolic: dominant lexical overlap with a clear lead → humanize-grade
    if ov >= 8 && ov_lead >= 4 {
        return 6;
    }
    if ov >= 5 && ov_lead >= 2 {
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

/// Search a KB (passed as `[{id, keywords}]` JSON) for `query`. Returns a ranked
/// `[{id, s, cos, overlap}]`. The KB is small (tens–hundreds of entries) so a
/// per-call IDF build is microseconds; no caching needed across the wasm boundary.
#[wasm_bindgen]
pub fn kb_search(kb: JsValue, query: &str) -> JsValue {
    let entries: Vec<KbEntryIn> = match serde_wasm_bindgen::from_value(kb) {
        Ok(v) => v,
        Err(_) => return serde_wasm_bindgen::to_value(&Vec::<KbHit>::new()).unwrap(),
    };
    let n = entries.len().max(1) as f32;
    // document grams + document frequency
    let doc_grams: Vec<Vec<String>> = entries.iter().map(|e| gram_set(&e.keywords)).collect();
    let mut df: std::collections::HashMap<&str, f32> = std::collections::HashMap::new();
    for gs in &doc_grams {
        for g in gs {
            *df.entry(g.as_str()).or_insert(0.0) += 1.0;
        }
    }
    let idf = |g: &str| ((n + 1.0) / (df.get(g).copied().unwrap_or(0.0) + 1.0)).ln() + 1.0;
    // normalized tf-idf doc vectors
    let norm_vec = |gs: &[String]| -> std::collections::HashMap<String, f32> {
        let mut v = std::collections::HashMap::new();
        let mut n2 = 0.0f32;
        for g in gs {
            let w = idf(g);
            v.insert(g.clone(), w);
            n2 += w * w;
        }
        let nr = n2.sqrt().max(1e-9);
        for w in v.values_mut() {
            *w /= nr;
        }
        v
    };
    let doc_vecs: Vec<_> = doc_grams.iter().map(|gs| norm_vec(gs)).collect();
    let qgrams = gram_set(query);
    let qv = norm_vec(&qgrams);

    let mut scored: Vec<KbHit> = Vec::new();
    for (i, e) in entries.iter().enumerate() {
        let mut overlap = 0i32;
        for g in &qgrams {
            if e.keywords.to_lowercase().contains(g.as_str()) {
                overlap += 1;
            }
        }
        let dv = &doc_vecs[i];
        let mut cos = 0.0f32;
        for (g, w) in &qv {
            if let Some(dw) = dv.get(g) {
                cos += w * dw;
            }
        }
        if overlap > 0 || cos > 0.0 {
            scored.push(KbHit {
                id: e.id.clone(),
                s: 0,
                cos,
                overlap,
            });
        }
    }
    // rank by cosine (primary), overlap (tiebreak)
    scored.sort_by(|a, b| {
        b.cos
            .partial_cmp(&a.cos)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.overlap.cmp(&a.overlap))
    });
    // assign the gate score from cosine + margin to runner-up
    let runner = scored.get(1).map(|h| h.cos).unwrap_or(0.0);
    let runner_overlap = scored.get(1).map(|h| h.overlap).unwrap_or(0);
    for (i, h) in scored.iter_mut().enumerate() {
        let margin = if i == 0 { h.cos - runner } else { 0.0 };
        let ov_lead = if i == 0 { h.overlap - runner_overlap } else { 0 };
        h.s = cos_to_score(h.cos, margin, h.overlap, ov_lead);
    }
    serde_wasm_bindgen::to_value(&scored).unwrap()
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
