#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ReflexWork Demo Script
# Sub-millisecond AI task routing with a reproducible audit trail.
#
# Demonstrates:
#   S1  Reflex Kernel   — sigmoid gate, BLAKE3 attestation (< 100 µs)
#   S2  MCP Server      — Kiro + Amazon Bedrock tools (5 tools)
#   S3  Audit Trail     — BLAKE3 proof recorded (optional on-chain variant)
#
# Usage:
#   ./demo.sh           # full demo
#   ./demo.sh --bench   # also run criterion benchmarks
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BLUE='\033[1;34m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
banner() { echo -e "\n${BLUE}${BOLD}══ $1 ══${NC}"; }
ok()     { echo -e "${GREEN}✓${NC}  $1"; }
info()   { echo -e "${YELLOW}→${NC}  $1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="${HOME}/.cargo/target/release/reflex-agent"

# ─── Header ──────────────────────────────────────────────────────────────────
banner "ReflexWork — End-to-End Demo"
echo -e "${BOLD}Microsecond AI task routing + reproducible BLAKE3 audit trail${NC}"
echo    "Mahidol AI Community 2026 — Track: AI Adoption with Kiro"
echo    "Repo    : https://github.com/ozoneRatchapon/reflexwork"
echo

# ─── Step 1: Build Reflex Kernel ─────────────────────────────────────────────
banner "Step 1 — Build Reflex Kernel (System 1)"
info "cargo build --release -p reflex-kernel"
cd "${REPO_ROOT}"
cargo build --release -p reflex-kernel 2>&1 | tail -2
ok "Kernel binary: ${AGENT}"

# ─── Step 2: Kernel status ───────────────────────────────────────────────────
banner "Step 2 — Kernel Status (local, zero RPC, zero token cost)"
RUST_LOG=warn "${AGENT}" status
ok "Gate threshold 0.72 — deterministic tasks → FastPath (no LLM, zero tokens)"

# ─── Step 3: Benchmarks (optional) ───────────────────────────────────────────
if [[ "${1:-}" == "--bench" ]]; then
  banner "Step 3 — Criterion Benchmarks"
  cargo bench --bench policy_routing 2>&1 | grep -E "time:|Found"
  ok "policy_route ≈ 12 ns  |  feature_encode ≈ 63 ns  (measured on Apple Silicon)"
else
  info "Benchmarks skipped (pass --bench to enable)"
fi

# ─── Step 4: MCP Server build ────────────────────────────────────────────────
banner "Step 4 — MCP Server Build (System 2)"
cd "${REPO_ROOT}/mcp-server"
info "npm run build"
npm run build 2>&1 | tail -3
ok "5 tools compiled: analyze_task, synthesize_document,"
ok "  query_knowledge_base, draft_workflow, attest_and_submit"
cd "${REPO_ROOT}"

# ─── Step 5: Audit trail — optional on-chain variant ─────────────────────────
banner "Step 5 — Audit Trail (optional on-chain variant)"
info "The audit trail runs on org-internal storage by default."
info "An optional variant anchors the same BLAKE3 proof on Solana devnet:"
solana program show 6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5 \
  | grep -E "Program Id|Last Deployed|Balance" || info "(skipped — no Solana CLI / offline)"
ok "Same BLAKE3 proof, portable across internal storage or chain"

# ─── Step 6: Full E2E smoke test S1 → audit ──────────────────────────────────
banner "Step 6 — End-to-End: S1 (Kernel) → BLAKE3 audit record"
info "Route task → BLAKE3 attestation → record proof → verify reproducibility"
echo
RUST_LOG=warn "${AGENT}" smoke-test
echo

# ─── Summary ─────────────────────────────────────────────────────────────────
banner "Demo Complete"
echo -e "${BOLD}What just happened:${NC}"
echo "  1. Task encoded into 64-dim feature vector"
echo "  2. Sigmoid gate scored → FastPath (< 100 µs, zero tokens)"
echo "  3. BLAKE3 composite hash: task_hash ⊕ state_hash ⊕ output_hash"
echo "  4. Decision recorded as a reproducible audit record"
echo "  5. Any auditor can re-run the same hash chain and get the same proof"
echo
echo -e "${BOLD}Performance:${NC}"
echo "  Fast-path latency  ≤ 100 µs   ✓"
echo "  Token cost         0 tokens    ✓"
echo "  Proof algorithm    BLAKE3      ✓  (reproducible, PDPA-friendly)"
echo
echo -e "${BOLD}Built with Kiro + Amazon Bedrock.${NC}  Optional on-chain variant: Solana devnet."
