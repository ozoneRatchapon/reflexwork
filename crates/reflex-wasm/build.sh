#!/usr/bin/env bash
# Build reflex-wasm → submissions/ui/wasm/ (the files chatbot.html imports).
# Uses cargo + wasm-bindgen directly (the official wasm-pack binary ships x86-only
# and is "Bad CPU type" on Apple Silicon; this two-step is what wasm-pack does
# under the hood and produces byte-identical output).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"

OUT="../../submissions/ui/wasm"
TARGET_DIR="${CARGO_TARGET_DIR:-target}"

cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir "$OUT" \
  "$TARGET_DIR/wasm32-unknown-unknown/release/reflex_wasm.wasm"

echo "✓ built → $OUT"
ls -la "$OUT"
