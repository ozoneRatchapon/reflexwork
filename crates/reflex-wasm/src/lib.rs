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

fn route(x: &[f32]) -> &'static str {
    let (w, b) = seeded_weights();
    let dot: f32 = w.iter().zip(x).map(|(wi, xi)| wi * xi).sum();
    let g = sigmoid(dot + b);
    if g < GATE_THRESHOLD * 0.55 {
        return "FastPath";
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
        return match best {
            1 => "McpAnalyze",
            2 => "McpSynthesize",
            3 => "Rejected",
            _ => "McpAnalyze",
        };
    }
    "FastPath"
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
}

/// Route one task entirely in the browser. Returns a JSON object with the
/// decision + a reproducible BLAKE3 proof — no backend, no token cost on the
/// fast path. Mirrors the native Rust kernel's decision exactly.
#[wasm_bindgen]
pub fn route_task(category: &str, input: &str, token_budget: u32, priority: u8) -> JsValue {
    let x = encode(category, input, token_budget, priority);
    let decision = route(&x);
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
    };
    serde_wasm_bindgen::to_value(&out).unwrap()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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
}
