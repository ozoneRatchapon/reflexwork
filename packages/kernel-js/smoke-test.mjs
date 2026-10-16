// Smoke test for @reflexwork/kernel — proves the package loads and routes,
// and that the BLAKE3 proof is reproducible. Run: node smoke-test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { init, routeTask, GATE_THRESHOLD } from './index.js';

const wasmBytes = readFileSync(
  fileURLToPath(new URL('./wasm/reflex_wasm_bg.wasm', import.meta.url))
);

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) failures++; };

await init(wasmBytes);

// 1) a short factual query routes FastPath at 0 token
const d1 = routeTask('DataQuery', 'ส่งรูปเล่มภายในกี่วัน', 2048, 128);
ok(d1.route === 'FastPath', `short DataQuery → FastPath (got ${d1.route})`);
ok(d1.fast_path === true, 'fast_path true');
ok(typeof d1.blake3_proof === 'string' && d1.blake3_proof.length === 64, 'proof is 64-hex');
ok(d1.gate_score < GATE_THRESHOLD, `gate_score ${d1.gate_score.toFixed(3)} < θ ${GATE_THRESHOLD}`);

// 2) a long research task escalates off the fast path
const long = 'investigate and synthesize '.repeat(40);
const d2 = routeTask('Research', long, 2048, 128);
ok(d2.fast_path === false, `long Research → not FastPath (got ${d2.route})`);

// 3) the proof is reproducible for the same input
const a = routeTask('DataQuery', 'count rows', 2048, 128).blake3_proof;
const b = routeTask('DataQuery', 'count rows', 2048, 128).blake3_proof;
ok(a === b, 'proof reproducible for identical input');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
