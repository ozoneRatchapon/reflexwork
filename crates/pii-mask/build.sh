#!/usr/bin/env bash
# Build pii-mask -> integrations/_shared/piimask/ (imported as a Workers wasm module by the kernel and LINE workers).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
OUT="../../integrations/_shared/piimask"
TARGET_DIR="$(cargo metadata --format-version 1 --no-deps | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')"
cargo build --release --target wasm32-unknown-unknown -p pii-mask --features worker
wasm-bindgen --target web --out-dir "$OUT" "$TARGET_DIR/wasm32-unknown-unknown/release/pii_mask.wasm"
ls -l "$OUT"
