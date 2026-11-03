#!/usr/bin/env node
// Steady-state speed of each pure function, JS vs Rust, INSIDE the real page (same browser, same data): each function runs over a
// corpus many times and the whole loop is timed (the browser clock is only ~0.1 ms accurate, so single calls cannot be timed).
// Best of 5 trials per cell, JS and Rust interleaved. Run it alone: other work on the machine adds noise.
//   node benchmark/engine/engine_micro.mjs --url "http://127.0.0.1:8791/chatbot.html" [--no-write]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'http://127.0.0.1:8791/chatbot.html', CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const golden = JSON.parse(readFileSync(join(root, 'benchmark/golden/resolve.json'), 'utf8')).cases.map(c => c.q);
const intakeTexts = readFileSync(join(root, 'benchmark/golden/intake.json'), 'utf8').trim().split('\n').map(l => l.replace(/,$/, '')).filter(l => l.startsWith('{')).map(l => JSON.parse(l).text);
const PORT = 9491, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-micro-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await wait(250); } }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.navigate', { url: BASE + (BASE.includes('?') ? '&' : '?') + 'engine=rust&api=http://127.0.0.1:9&llm=http://127.0.0.1:9' });
for (let i = 0; i < 120; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0) && window.__eng && window.__eng.name === 'rust'`)) break; }
if (await ev(`window.__eng.name`) !== 'rust') { console.error('the page did not start the Rust engine (old wasm?)'); process.exit(2); }
const BODY = `(async () => {
  const E = window.__eng, { KB, PROG, search } = E.data(), I = E.impl;
  const golden = ${JSON.stringify(golden)}, texts = ${JSON.stringify(intakeTexts)};
  const sec = (p, k) => (p.announcement && p.announcement.sections && p.announcement.sections[k]) || [];
  const withAnn = PROG.filter(p => p.announcement);
  const gates = [0.3, 0.59, 0.7, 0.79, 0.8, 0.9], scs = [[], [7], [4], [3], [6, 4], [5, 4], [4, 3], [3, 2], [2, 2], [4, 2]];
  const ranked = s => s.map((v, i) => ({ e: KB[i % KB.length], s: v }));
  const lists = KB.slice(0, 80).map((e, i) => [e.title, KB[(i * 7 + 3) % KB.length].title]);
  const corp = {
    answerPoints: KB.map(e => [e.answer]),
    slotLead: KB.flatMap(e => ['ส่งเล่มภายในกี่วัน', 'ค่าธรรมเนียมเท่าไหร่', 'turnitin เกินกี่ %', 'ทำยังไง'].map(q => [e, q])),
    decideTier: gates.flatMap(g => scs.map(s => [{ gate: g, ranked: ranked(s) }])),
    fee: withAnn.map(p => [sec(p, 'ค่าธรรมเนียมการศึกษา')]),
    schedule: withAnn.map(p => [sec(p, 'กำหนดการสอบคัดเลือก')]),
    classifyIssue: texts.map(t => [t]), isAdvice: texts.map(t => [t]), isEnglish: texts.map(t => [t]),
    understand: lists.map(l => [l]),
    resolveProgramme: golden.map(q => [q, PROG, false]),
  };
  const out = [];
  for (const name of Object.keys(corp)) {
    const c = corp[name], js = I[name].js, rust = I[name].rust;
    const t0 = performance.now(); for (const a of c.slice(0, 3)) rust(...a); const first = performance.now() - t0;   // includes the one-time resolver build
    const best = { js: Infinity, rust: Infinity };
    for (let trial = 0; trial < 5; trial++) for (const k of trial % 2 ? ['rust', 'js'] : ['js', 'rust']) {
      const fn = k === 'js' ? js : rust; let calls = 0; const t = performance.now();
      do { for (const a of c) fn(...a); calls += c.length; } while (performance.now() - t < 150);
      best[k] = Math.min(best[k], (performance.now() - t) * 1000 / calls); }
    out.push({ name, corpus: c.length, jsUs: best.js, rustUs: best.rust, firstMs: first });
  }
  return JSON.stringify(out); })()`;
const res = await send('Runtime.evaluate', { expression: BODY, awaitPromise: true, returnByValue: true });
if (res.exceptionDetails) { console.error('page error:', res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails).slice(0, 800)); process.exit(3); }
const rows = res.result.value;
const R = JSON.parse(rows), f = (x, d = 1) => x.toFixed(d);
const md = [`# Engine micro-benchmark — ${new Date().toISOString().slice(0, 10)}`, '', `Page: ${BASE} (headless Chrome, ${await ev('navigator.userAgent')}). Best of 5 trials, JS and Rust interleaved, same data, loop-timed.`, '',
  '| function | corpus | JS µs/call | Rust µs/call | speed-up | first Rust call ms |', '|---|---|---|---|---|---|',
  ...R.map(r => `| ${r.name} | ${r.corpus} | ${f(r.jsUs, 2)} | ${f(r.rustUs, 2)} | ${f(r.jsUs / r.rustUs)}× | ${f(r.firstMs)} |`)];
console.log(md.join('\n'));
if (!process.argv.includes('--no-write')) { const dir = join(root, 'benchmark/engine/results'); mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir).filter(x => /^\d{3}_/.test(x)).length + 1; writeFileSync(join(dir, `${String(n).padStart(3, '0')}_${new Date().toISOString().slice(0, 10)}_micro.md`), md.join('\n') + '\n'); }
cleanup(); process.exit(0);
