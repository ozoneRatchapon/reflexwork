// What the kernel gate does for the inputs the web chat actually sends (category 'DataQuery', budget 2048, priority 128).
//   node benchmark/compare/gate_probe.mjs
// Shows g never exceeds ~0.451 < theta 0.72, i.e. the gate cannot route a web query away from FastPath (docs/METHOD.md 3.1).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ui = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'submissions/ui');
const mod = await import(join(ui, 'wasm/reflex_wasm.js'));
mod.initSync({ module: readFileSync(join(ui, 'wasm/reflex_wasm_bg.wasm')) });
const row = (len) => { const d = mod.route_task('DataQuery', 'ก'.repeat(len), 2048, 128); return `${String(len).padStart(6)} chars  g=${d.gate_score.toFixed(3)}  route=${d.route}`; };
for (const n of [5, 40, 200, 500, 1000, 2000, 5000, 100000]) console.log(row(n));
// what the chat actually sends: other categories / priorities, to show it is the CONSTANTS that pin the gate
for (const [c, pr] of [['Research', 128], ['DocumentParse', 128], ['DataQuery', 255]]) { const d = mod.route_task(c, 'ก'.repeat(300), 2048, pr); console.log(`cat=${c} prio=${pr} 300 chars g=${d.gate_score.toFixed(3)} route=${d.route}`); }
