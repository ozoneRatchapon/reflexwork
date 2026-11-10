// Plan 009 C4: what the shared Rust router costs a worker before LINE loads it.
// Times, in plain Node (V8, same engine as Workers): wasm compile + instantiate, `new Router(kb, programmes)`, and `decide` per question.
// Run: node benchmark/coldstart/router_cost.mjs
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { initSync, Router } from '../../submissions/ui/wasm/reflex_wasm.js';

const ui = new URL('../../submissions/ui/', import.meta.url);
const bytes = readFileSync(new URL('wasm/reflex_wasm_bg.wasm', ui));
const kb_raw = readFileSync(new URL('knowledge-index.json', ui));
const prog_raw = readFileSync(new URL('programmes.json', ui));
const kib = (n) => (n / 1024).toFixed(1);
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

console.log(`wasm ${kib(bytes.length)} KiB (${kib(gzipSync(bytes).length)} gzip); kb ${kib(kb_raw.length)} KiB (${kib(gzipSync(kb_raw).length)} gzip); programmes ${kib(prog_raw.length)} KiB (${kib(gzipSync(prog_raw).length)} gzip)`);

let t0 = process.hrtime.bigint();
const module = new WebAssembly.Module(bytes);
const t_compile = ms(t0);
t0 = process.hrtime.bigint();
initSync({ module });
const t_init = ms(t0);

t0 = process.hrtime.bigint();
const kb = JSON.parse(kb_raw);
const prog = JSON.parse(prog_raw).programmes;
const t_parse = ms(t0);

const builds = [];
let router;
for (let i = 0; i < 7; i++) {
  t0 = process.hrtime.bigint();
  router = new Router(kb, prog, undefined);
  builds.push(ms(t0));
}
const builds_kb_only = [];
for (let i = 0; i < 7; i++) {
  t0 = process.hrtime.bigint();
  new Router(kb, [], undefined);
  builds_kb_only.push(ms(t0));
}

const state = { progState: 'ok', aiOff: true, pinnedId: null, programmeInFocus: null, today: '2026-11-10', agencyHasIt: false };
const qs = ['ค่าเทอมเท่าไหร่', 'สมัครเรียนปริญญาโทต้องใช้อะไรบ้าง', 'ลืมรหัสผ่าน', 'สวัสดีครับ', 'how do I apply for a PhD', 'ขอเลื่อนสอบวิทยานิพนธ์'];
const first = [];
for (const q of qs) { t0 = process.hrtime.bigint(); router.decision(q, state, null); first.push(ms(t0)); }
const warm = [];
for (let r = 0; r < 50; r++) for (const q of qs) { t0 = process.hrtime.bigint(); router.decision(q, state, null); warm.push(ms(t0)); }

console.log(`compile ${t_compile.toFixed(2)} ms; instantiate ${t_init.toFixed(2)} ms; JSON.parse kb+programmes ${t_parse.toFixed(2)} ms`);
console.log(`new Router(kb, programmes): first ${builds[0].toFixed(2)} ms, median ${median(builds).toFixed(2)} ms; kb only: median ${median(builds_kb_only).toFixed(2)} ms`);
console.log(`decision: first call ${first[0].toFixed(2)} ms, first-pass median ${median(first).toFixed(2)} ms, warm median ${median(warm).toFixed(3)} ms, warm max ${Math.max(...warm).toFixed(2)} ms`);
