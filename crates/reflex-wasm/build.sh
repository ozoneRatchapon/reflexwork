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

# Shrink with binaryen when it is installed (brew install binaryen): ~290 KB instead of ~410 KB. The feature flags match what rustc emits.
if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types \
    "$OUT/reflex_wasm_bg.wasm" -o "$OUT/reflex_wasm_bg.opt.wasm" && mv "$OUT/reflex_wasm_bg.opt.wasm" "$OUT/reflex_wasm_bg.wasm"
else
  echo "(wasm-opt not found: the wasm is not size-optimised)"
fi

echo "✓ built → $OUT"
ls -la "$OUT"
