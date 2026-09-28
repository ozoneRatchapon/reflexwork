# ReflexWork — Modelless Reflex Engine Specification

## 1. Motivation & Design Philosophy

The Reflex Kernel is a **zero-LLM, deterministic policy engine** that runs entirely in Rust
(compiling to native binary or WebAssembly). It replaces the "always-call-the-LLM" pattern
with a latent-space policy that makes routing decisions in **14–51 microseconds** — orders of
magnitude faster than any network-bound inference call.

Key properties:
- **Zero marginal token cost** for the fast path (> 80% of all tasks).
- **Deterministic output** given same input state (reproducible audits).
- **Cryptographically attested** state via BLAKE3 hashing.
- **Online learning** via EMA reward signal (adapts without retraining).

---

## 2. Core Mathematical Model

### 2.1 Input Feature Vector

Each incoming `TaskSpec` is projected into a fixed-dimension feature vector:

```
x ∈ ℝᴺ,   N = 64  (default)
```

Feature encoding (concatenated):
```
x = [ x_type || x_complexity || x_budget || x_deadline || x_context || x_pad ]
     [  8 dim  ][    8 dim    ][   8 dim  ][    8 dim   ][   16 dim  ][16 dim ]
```

Where:
- `x_type`       — one-hot encoding of task category (DocumentParse, CodeGen, DataQuery, etc.)
- `x_complexity` — normalized complexity score in [0, 1] derived from token count estimate
- `x_budget`     — remaining token budget as fraction of initial allocation
- `x_deadline`   — time-to-deadline normalized to [0, 1], clipped at 0
- `x_context`    — TF-IDF-like bag-of-features over task keyword set (precomputed lookup table)
- `x_pad`        — zero-padded to fixed width

### 2.2 Policy Weight Vector

```
w ∈ ℝᴺ,   initialized from a small precomputed personality manifest
b ∈ ℝ     (scalar bias term)
```

The policy weight vector `w` encodes the "personality" of the reflex agent — analogous to
the `katgpt-personality` latent layer composition. It is stored as a compact `f32` array
and serialized into the `PersonalitySnapshot`.

### 2.3 Sigmoid Gate (Binary Route Decision)

The gate score `g` determines whether System 2 (LLM) must be invoked:

```
g = σ(wᵀx + b)

where σ(z) = 1 / (1 + e⁻ᶻ)
```

Routing rule:
```
route = { System2 (MCP/LLM)     if g ≥ θ_gate
         { System3 (Anchor fast) if g <  θ_gate

θ_gate = 0.72  (default; tunable per deployment context)
```

### 2.4 Multi-Class Route Extension

For K routing targets (K ≥ 2), the binary gate generalizes to a softmax:

```
W ∈ ℝᴷˣᴺ,   b_vec ∈ ℝᴷ

logits = W · x + b_vec              (shape: K)
P(k|x) = softmax(logits)_k = exp(logits_k) / Σⱼ exp(logits_j)

route* = argmax_k P(k|x)
```

Route classes (`K = 4`):
```
0 → FAST_PATH        : direct Anchor TX, no LLM (< 51µs)
1 → MCP_ANALYZE      : call analyze_task tool
2 → MCP_SYNTHESIZE   : call synthesize_document or draft_workflow tool
3 → REJECT           : budget exceeded or deadline passed → emit error event
```

### 2.5 EMA Reward Update (Online Adaptation)

After each task completes, the kernel receives a reward signal `r ∈ [-1, +1]`:

```
r = +1.0  → task settled successfully onchain
r =  0.0  → task completed but no settlement
r = -1.0  → task failed, timeout, or proof rejected
```

Weight update via reward-weighted EMA (no gradient, no LLM):

```
ŵ_new = α · w + (1 - α) · (r · x)

where α = 0.97  (EMA decay, configurable)
```

This is equivalent to a single-layer Hebbian update — the weight vector drifts toward input
patterns that produce positive reward over time. Combined with periodic persistence to disk,
the kernel "learns" without ever calling an LLM.

---

## 3. Data Structures

### 3.1 TaskSpec

```rust
/// Inbound task payload from any trigger source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub id: Uuid,                        // UUIDv4, unique per task
    pub category: TaskCategory,          // enum: DocumentParse | CodeGen | DataQuery | ...
    pub raw_input: String,               // raw natural language or structured input
    pub token_budget: u32,               // max tokens allowed for System 2 invocation
    pub deadline_unix_ns: u64,           // hard deadline as Unix nanoseconds
    pub priority: u8,                    // 0 (low) – 255 (critical)
    pub context_tags: Vec<String>,       // keyword tags for feature encoding
    pub requester_pubkey: Option<String>,// Solana pubkey if onchain settlement required
    pub workflow_id: Option<Uuid>,       // links to a WorkflowEscrow account
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskCategory {
    DocumentParse,
    CodeGen,
    DataQuery,
    WorkflowOrchestration,
    ComplianceCheck,
    OnchainSettlement,
    Custom(String),
}
```

### 3.2 PolicyState

```rust
/// The in-memory policy state of the Reflex Kernel.
/// Serializable for persistence and BLAKE3 attestation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyState {
    pub version: u32,                    // monotonically increasing, incremented on each update
    pub weights: Vec<f32>,               // w ∈ ℝᴺ, length = FEATURE_DIM
    pub bias: f32,                       // scalar b
    pub ema_alpha: f32,                  // EMA decay coefficient (default 0.97)
    pub gate_threshold: f32,             // θ_gate (default 0.72)
    pub total_tasks_processed: u64,
    pub total_fast_path: u64,
    pub total_llm_invocations: u64,
    pub last_updated_unix_ns: u64,
}

impl PolicyState {
    pub const FEATURE_DIM: usize = 64;
    pub const DEFAULT_ALPHA: f32 = 0.97;
    pub const DEFAULT_THETA: f32 = 0.72;
}
```

### 3.3 PersonalitySnapshot (BLAKE3 Attestation Target)

```rust
/// A frozen, serializable snapshot of policy state.
/// BLAKE3 hash of the canonical serialization is the "state commitment".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalitySnapshot {
    pub snapshot_id: Uuid,
    pub policy: PolicyState,
    pub created_at_unix_ns: u64,
    pub environment_tag: String,         // e.g. "devnet-v1", "prod-enterprise"
}
```

### 3.4 StateAttestation

```rust
/// Cryptographic attestation produced by the Reflex Kernel.
/// Submitted onchain as proof of deterministic execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateAttestation {
    pub snapshot_id: Uuid,               // links to the PersonalitySnapshot
    pub task_id: Uuid,                   // the task this execution covers
    pub input_hash: [u8; 32],            // BLAKE3(canonical(task_spec))
    pub state_hash: [u8; 32],            // BLAKE3(canonical(personality_snapshot))
    pub output_hash: [u8; 32],           // BLAKE3(canonical(route_decision + tool_result))
    pub composite_hash: [u8; 32],        // BLAKE3(input_hash || state_hash || output_hash)
    pub route_taken: RouteDecision,
    pub execution_ns: u64,               // wall-clock execution time in nanoseconds
    pub timestamp_unix_ns: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RouteDecision {
    FastPath,
    McpAnalyze,
    McpSynthesize,
    Rejected { reason: String },
}
```

### 3.5 FeatureEncoder

```rust
/// Encodes a TaskSpec into x ∈ ℝᴺ.
pub struct FeatureEncoder {
    vocabulary: HashMap<String, usize>,  // context_tags → feature index
    vocab_dim: usize,                    // = 16 (context feature slots)
}
```

---

## 4. BLAKE3 Hashing Protocol

### 4.1 Canonical Serialization

All BLAKE3 inputs use **canonical deterministic serialization** — specifically
`bincode` with little-endian encoding and no padding. This ensures byte-identical
output across all platforms and Wasm targets.

```rust
use blake3::Hasher;
use bincode::Options;

fn blake3_hash<T: Serialize>(value: &T) -> [u8; 32] {
    let opts = bincode::DefaultOptions::new()
        .with_little_endian()
        .with_fixed_int_encoding()
        .reject_trailing_bytes();
    let bytes = opts.serialize(value).expect("canonical serialize");
    let mut hasher = Hasher::new();
    hasher.update(&bytes);
    *hasher.finalize().as_bytes()
}
```

### 4.2 Composite Proof Construction

The `composite_hash` submitted onchain is computed as:

```
composite_hash = BLAKE3(
    input_hash  [32 bytes]
 || state_hash  [32 bytes]
 || output_hash [32 bytes]
)                                       // total input: 96 bytes
```

This is a **Merkle-leaf commitment** pattern: any party can independently verify
the proof by re-running the same hash chain over the same inputs.

### 4.3 Onchain Verification

The Anchor program stores `composite_hash: [u8; 32]` in `TaskAttestation`.
The `submit_execution_proof` instruction verifies:

```
require!(
    submitted_composite == expected_composite,
    ReflexError::InvalidProof
);
```

Since BLAKE3 is collision-resistant and the inputs are fully deterministic, this
provides a **zero-knowledge proof of correct execution** without requiring the
Anchor program to re-execute any logic.

---

## 5. Execution Pipeline

```
TaskSpec arrives
      │
      ▼
FeatureEncoder::encode(&task) → x ∈ ℝ⁶⁴              ~1 µs
      │
      ▼
PolicyRouter::score(x, &policy) → gate g ∈ [0,1]      ~2 µs
      │
      ▼
BudgetController::check(&task, &budget_ledger)          ~1 µs
      │        │
   PASS       REJECT → StateAttestation { route: Rejected }
      │
      ▼
StateAttestor::attest(&snapshot, &task, route)
  → input_hash, state_hash (BLAKE3)                     ~8 µs
      │
      ├── g < θ_gate  (FAST PATH)
      │     │
      │     ▼
      │   AnchorClient::submit_execution_proof(attest)  async, ~200ms
      │
      └── g ≥ θ_gate  (MCP PATH)
            │
            ▼
          McpClient::call_tool(tool_name, params)       async, ~350-800ms
            │
            ▼
          StateAttestor::attest_output(&tool_result)
            → output_hash, composite_hash              ~3 µs
            │
            ▼
          AnchorClient::submit_execution_proof(attest)  async

Total fast-path latency (S1 only): ~14 µs
Total fast-path + Solana TX:        ~214 µs – 451 µs
```

---

## 6. Configuration Schema

```toml
# reflex-kernel.toml

[policy]
feature_dim    = 64
gate_threshold = 0.72
ema_alpha      = 0.97
snapshot_path  = "~/.reflexwork/policy-snapshot.bin"
auto_persist   = true          # persist after every N tasks
persist_every  = 100

[budget]
default_token_budget = 4096
hard_deadline_ms     = 2000    # reject tasks with deadline < 2s from now
cost_per_llm_call    = 500     # virtual token units deducted per MCP call

[blake3]
encoding = "bincode-le"        # canonical serialization format
domain_sep = "reflexwork-v1"   # domain separation prefix for BLAKE3

[solana]
rpc_url    = "https://api.devnet.solana.com"
program_id = "PLACEHOLDER_PROGRAM_ID"
commitment = "confirmed"
```

---

## 7. Performance Targets & Invariants

| Metric | Target | Invariant |
|--------|--------|-----------|
| Feature encoding latency | ≤ 2 µs | Must not allocate on heap in hot path |
| Gate scoring latency | ≤ 5 µs | Pure `f32` dot-product, SIMD-safe |
| BLAKE3 attestation latency | ≤ 10 µs | 96-byte input, single-pass |
| Full fast-path (S1 only) | ≤ 51 µs | P99 target |
| Memory footprint (Wasm) | ≤ 2 MB | Must run in constrained environments |
| Policy state size | ≤ 4 KB | `N=64 f32` = 256 bytes + metadata |
| LLM invocation rate | ≤ 20% | Configurable; default gates 80% deterministically |
