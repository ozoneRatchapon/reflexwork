// The Rust resolver compiles the page's regexes from a GENERATED file, so it cannot drift by a typo.
// This fails when chatbot.html's programme-matching regexes change and crates/reflex-wasm/src/resolve/patterns_src.rs was not regenerated.
// Fix: node scripts/gen_rust_pattern_sources.mjs, then `cargo test -p reflex-wasm` (golden), then regenerate the golden if the change is intended.
// Run: node tests/rust_patterns_sync.test.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [join(root, 'scripts/gen_rust_pattern_sources.mjs'), '--check'], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
process.exit(r.status === 0 ? 0 : 1);
