#!/usr/bin/env node
// Checks a BUILT wasm package against the golden contract (benchmark/golden): every exported function must return exactly what the
// page's JS returned (strictly: null is not undefined). Run this on the artefact that would be deployed, before switching the page to it.
//   node scripts/wasm_golden_check.mjs submissions/ui/wasm      the artefact the page loads (web target; build it with crates/reflex-wasm/build.sh)
//   node scripts/wasm_golden_check.mjs /tmp/rw_wasm             or a `wasm-bindgen --target nodejs` output directory
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib/chatbot_fns.mjs';
const pkg = process.argv[2];
if (!pkg) { console.error('usage: node scripts/wasm_golden_check.mjs <wasm-bindgen --target nodejs output dir>'); process.exit(2); }
const mod = await import(pathToFileURL(resolve(pkg, 'reflex_wasm.js')).href);
const w = mod.route_task ? mod : (mod.default || mod);
if (typeof w.initSync === 'function') w.initSync({ module: readFileSync(resolve(pkg, 'reflex_wasm_bg.wasm')) });   // web target: instantiate synchronously
for (const n of ['answer_points', 'slot_lead', 'decide_tier', 'schedule_table', 'fee_table', 'understand', 'classify_issue', 'is_advice', 'is_english', 'Resolver']) {
  if (!w[n]) { console.error(`missing export: ${n} (is this an old build?)`); process.exit(1); } }
const fs = { readFileSync };
const load = f => fs.readFileSync(`${root}/benchmark/golden/${f}.json`, 'utf8').trim().split('\n').map(l => l.replace(/,$/, '')).filter(l => l.startsWith('{')).map(l => JSON.parse(l));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let failed = false;
// plan 010 item 6: each contract has a floor (~95% of its size on 2026-11-09), so a truncated or emptied golden file cannot pass as
// "0 differences". Raise a floor when a contract grows on purpose; lowering one is a decision, say why in the commit.
const MIN = { intake: 930, understand: 1260, decide_tier: 86, answer_points: 125, schedule_fee: 218, 'resolve (x2)': 2550 };
const rep = (name, n, bad) => { const short = n < (MIN[name] ?? 1); failed ||= bad > 0 || short;
  console.log(`${name.padEnd(14)} ${String(n).padStart(5)} cases  ${bad} differences${short ? `  TOO FEW (minimum ${MIN[name] ?? 1})` : ''}`); };
let bad = 0;
const I = load('intake'); for (const c of I) { const i = w.classify_issue(c.text); if (!same(i === null ? null : { kind: i.kind, category: i.category, label: i.label }, c.issue) || w.is_advice(c.text) !== c.advice || w.is_english(c.text) !== c.english) bad++; } rep('intake', I.length, bad);
bad = 0; const U = load('understand'); for (const c of U) { const o = w.understand(c.phrases, c.results); if (!same(JSON.parse(JSON.stringify(o, Object.keys(o).sort())), JSON.parse(JSON.stringify(c.out, Object.keys(c.out).sort())))) bad++; } rep('understand', U.length, bad);
bad = 0; const T = load('decide_tier'); for (const c of T) if (!same(w.decide_tier(c.gate ?? NaN, Float64Array.from(c.scores)), c.out)) bad++; rep('decide_tier', T.length, bad);
bad = 0; const A = load('answer_points'); for (const c of A) { if (!same(w.answer_points(c.answer), c.points)) bad++; for (const [q, want] of Object.entries(c.slot)) if (w.slot_lead(c.answer, q) !== want) bad++; } rep('answer_points', A.length, bad);
bad = 0; const S = load('schedule_fee'); for (const c of S) { const s = w.schedule_table(c.schedule_lines), f = w.fee_table(c.fee_lines);
  if (!same({ cols: s.cols, rows: s.rows, notes: s.notes, list: s.list }, c.schedule) || !same(f, c.fee)) bad++; } rep('schedule_fee', S.length, bad);
const G = JSON.parse(fs.readFileSync(`${root}/benchmark/golden/resolve.json`, 'utf8')); const R = new w.Resolver(G.catalogue); bad = 0; let nulls = 0;
for (const c of G.cases) for (const [loose, key] of [[false, 'out'], [true, 'loose']]) { const r = R.resolve(c.q, loose); if (r === null) nulls++; if (!same(r, c[key])) bad++; }
rep('resolve (x2)', G.cases.length, bad); console.log(`(resolve returned a real null ${nulls} times; undefined would have been counted as a difference)`);
process.exit(failed ? 1 : 0);
