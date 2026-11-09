#!/usr/bin/env bash
# Build feedback-core -> integrations/kernel-worker/fbcore/ (the kernel worker imports the .wasm as a Workers wasm module).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
OUT="../../integrations/kernel-worker/fbcore"
TARGET_DIR="$(cargo metadata --format-version 1 --no-deps | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')"
cargo build --release --target wasm32-unknown-unknown -p feedback-core
wasm-bindgen --target web --out-dir "$OUT" "$TARGET_DIR/wasm32-unknown-unknown/release/feedback_core.wasm"
if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types \
    "$OUT/feedback_core_bg.wasm" -o "$OUT/feedback_core_bg.opt.wasm" && mv "$OUT/feedback_core_bg.opt.wasm" "$OUT/feedback_core_bg.wasm"
fi
ls -l "$OUT"
