#!/usr/bin/env node
// A/B of the two engines on the REAL page: the same questions (and a few multi-turn sequences) run with ?engine=js and ?engine=rust
// in headless Chrome (fresh page per question, dead ?api=/?llm= ports: nothing reaches production, no AI is called).
// For each question it compares what the student sees (answer text, source topic, choice chips, buttons); then it reports timing:
// per-function mean time (from the page's own counters), end-to-end click-to-answer, wasm init, resolver build, wasm bytes.
//   node benchmark/engine/engine_ab.mjs --url "http://127.0.0.1:8791/chatbot.html" [--limit 400] [--runs 1] [--no-write]
// Needs Node >= 22 and Chrome (CHROME=/path). Writes benchmark/engine/results/NNN_<date>.md and /tmp/rw_ab/last.json.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'http://127.0.0.1:8791/chatbot.html', LIMIT = Number(arg('--limit') || 400), RUNS = Number(arg('--runs') || 1);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const lines = f => readFileSync(join(root, f), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const faq = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items.filter(i => i.student && i.th).map(i => i.th);
const odd = JSON.parse(readFileSync(join(root, 'benchmark/odd/odd_questions.json'), 'utf8')).items.map(i => i.q);
const gold = JSON.parse(readFileSync(join(root, 'benchmark/golden/resolve.json'), 'utf8')).cases.filter((_, i) => i % 11 === 0).map(c => c.q);   // programme / topic / typo questions
const seqs = [['อยากสมัครเรียนจิตวิทยาคลินิก', 'แล้วค่าเทอมล่ะ', 'แล้วสอบสัมภาษณ์วันไหน'], ['อยากสมัครเรียนจิตวิทยาคลินิก', 'ยังเปิดรับอยู่ไหม'], ['เรียนไรดี'], ['ทำงานอะไรดี'], ['มีทุนไหม'], ['มีหอพักไหม'],
  ['ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก'], ['ช่วยแนะนำเรื่องส่ง Turnitin Originality Report'], ['เรียนรายยย'], ['กายอุปกณ์'], ['ลืมรหัสผ่านเข้า e-Thesis'], ['login ไม่ได้ account'], ['What is the thesis submission deadline?'], ['ค่าเทอมปริญญาโทฟรีใช่ไหม'], ['mph'], ['2022M04G']];
const singles = [...new Set([...lines('benchmark/coverage/beginner_questions.txt'), ...faq, ...odd, ...gold])].slice(0, LIMIT).map(q => [q]);
const CASES = [...seqs, ...singles];
const PORT = 9490, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-ab-'));
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
await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

const urlFor = engine => BASE + (BASE.includes('?') ? '&' : '?') + `engine=${engine}&api=http://127.0.0.1:9&llm=http://127.0.0.1:9`;
const askJs = q => `new Promise(res => { const chat = document.getElementById('chat'), n0 = chat.querySelectorAll('.msg.b').length, t0 = performance.now();
  const i = document.getElementById('q'); i.value = ${JSON.stringify(q)}; document.getElementById('send').click();
  const tick = () => { const b = [...chat.querySelectorAll('.msg.b')], l = b[b.length - 1];
    if (b.length > n0 && l && !l.querySelector('.typing') && !l.classList.contains('pending')) { const ms = performance.now() - t0;
      res({ ms, text: l.innerText.replace(/\\s+/g, ' ').trim(), topic: ((l.querySelector('.topic') || {}).textContent || '').trim(),
        chips: [...l.querySelectorAll('.dis')].map(x => x.textContent.trim()), buttons: [...l.querySelectorAll('.golink')].map(x => x.textContent.trim()), rows: l.querySelectorAll('.sched tr').length }); return; }
    if (performance.now() - t0 > 15000) { res({ ms: 15000, text: '(timeout)', topic: '', chips: [], buttons: [], rows: 0 }); return; } setTimeout(tick, 20); }; tick(); })`;
async function runCase(engine, seq) {
  await send('Page.navigate', { url: urlFor(engine) });
  for (let i = 0; i < 120; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  await wait(100);
  const steps = []; for (const q of seq) steps.push(await ev(askJs(q)));
  const eng = await ev(`JSON.stringify({ name: window.__eng && window.__eng.name, t: window.__eng && window.__eng.t, n: window.__eng && window.__eng.n, errors: window.__eng && window.__eng.errors, wasmInitMs: window.__eng && window.__eng.wasmInitMs, resolverBuildMs: window.__eng && window.__eng.resolverBuildMs })`);
  const wasm = await ev(`JSON.stringify(performance.getEntriesByType('resource').filter(e => /\\.wasm/.test(e.name)).map(e => ({ bytes: e.encodedBodySize, ms: e.duration })))`);
  return { steps, eng: JSON.parse(eng || '{}'), wasm: JSON.parse(wasm || '[]') };
}
// ---- one long session per engine (a student asking many things in the same page): total time and the whole answer sequence
async function runSession(engine, qs) {
  await send('Page.navigate', { url: urlFor(engine) });
  for (let i = 0; i < 120; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  const steps = [], t0 = Date.now(); for (const q of qs) steps.push(await ev(askJs(q)));
  const eng = JSON.parse(await ev(`JSON.stringify({ t: window.__eng.t, n: window.__eng.n, errors: window.__eng.errors, resolverBuildMs: window.__eng.resolverBuildMs })`));
  return { steps, eng, wallMs: Date.now() - t0 };
}
if (process.argv.includes('--session')) {
  const qs = [...new Set([...gold, ...faq, ...lines('benchmark/coverage/beginner_questions.txt')])].slice(0, Number(arg('--session-size') || 150));
  const a = await runSession('js', qs), b = await runSession('rust', qs);
  const sameN = qs.filter((_, i) => a.steps[i].text === b.steps[i].text && a.steps[i].topic === b.steps[i].topic).length;
  const sum = r => r.steps.reduce((n, x) => n + x.ms, 0), fn = (r, f) => (r.eng.t[f] || 0);
  const md = [`# Engine session test — ${new Date().toISOString().slice(0, 10)}`, '', `One page per engine, ${qs.length} questions in a row (programme, topic, FAQ and probe questions), same order, no reload, cache disabled, no AI.`, '',
    `- Same answer text and topic: **${sameN} of ${qs.length}** · Rust fallbacks: ${b.eng.errors}`, `- Sum of click-to-answer times: JS ${sum(a).toFixed(0)} ms · Rust ${sum(b).toFixed(0)} ms`,
    `- Time inside resolveProgramme: JS ${fn(a, 'resolveProgramme').toFixed(0)} ms over ${a.eng.n.resolveProgramme} calls · Rust ${fn(b, 'resolveProgramme').toFixed(0)} ms over ${b.eng.n.resolveProgramme} calls (index build ${(b.eng.resolverBuildMs || 0).toFixed(1)} ms, once)`,
    `- All pure functions together: JS ${Object.keys(a.eng.t).reduce((n, f) => n + a.eng.t[f], 0).toFixed(0)} ms · Rust ${Object.keys(b.eng.t).reduce((n, f) => n + b.eng.t[f], 0).toFixed(0)} ms`];
  console.log('\n' + md.join('\n'));
  if (!process.argv.includes('--no-write')) { const dir = join(root, 'benchmark/engine/results'); mkdirSync(dir, { recursive: true });
    const n = readdirSync(dir).filter(f => /^\d{3}_/.test(f)).length + 1; writeFileSync(join(dir, `${String(n).padStart(3, '0')}_${new Date().toISOString().slice(0, 10)}_session.md`), md.join('\n') + '\n'); }
  cleanup(); process.exit(sameN === qs.length && !b.eng.errors ? 0 : 1);
}
const out = { js: [], rust: [] }, t0 = Date.now();
for (let k = 0; k < CASES.length; k++) {
  for (const engine of ['js', 'rust']) out[engine].push(await runCase(engine, CASES[k]));
  if ((k + 1) % 50 === 0) console.log(`  ${k + 1}/${CASES.length}  (${Math.round((Date.now() - t0) / 1000)} s)`);
}
// ---- compare what the student sees
const diffs = [];
CASES.forEach((seq, k) => seq.forEach((q, s) => { const a = out.js[k].steps[s], b = out.rust[k].steps[s];
  const same = a.text === b.text && a.topic === b.topic && JSON.stringify(a.chips) === JSON.stringify(b.chips) && JSON.stringify(a.buttons) === JSON.stringify(b.buttons) && a.rows === b.rows;
  if (!same) diffs.push({ q, step: s, js: a.text.slice(0, 160), rust: b.text.slice(0, 160), jsTopic: a.topic, rustTopic: b.topic }); }));
const questions = CASES.reduce((n, s) => n + s.length, 0);
// ---- timing
const sumFn = engine => { const t = {}, n = {}; out[engine].forEach(r => { for (const [f, v] of Object.entries(r.eng.t || {})) t[f] = (t[f] || 0) + v; for (const [f, v] of Object.entries(r.eng.n || {})) n[f] = (n[f] || 0) + v; }); return { t, n }; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const e2e = engine => out[engine].flatMap(r => r.steps.map(s => s.ms));
const fnJs = sumFn('js'), fnRust = sumFn('rust');
const fns = [...new Set([...Object.keys(fnJs.n), ...Object.keys(fnRust.n)])].sort();
const mean = (x, f) => x.n[f] ? (x.t[f] / x.n[f]) * 1000 : NaN;   // microseconds per call
const errors = out.rust.reduce((n, r) => n + (r.eng.errors || 0), 0);
const med = (engine, key) => { const v = out[engine].map(r => r.eng[key]).filter(x => typeof x === 'number' && x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const wasmBytes = Math.max(...out.rust.map(r => (r.wasm[0] || {}).bytes || 0));
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : '-';
const report = [`# Engine A/B — ${new Date().toISOString().slice(0, 10)}`, '',
  `Page: ${BASE} · ${CASES.length} cases (${questions} questions: ${seqs.length} multi-turn sequences + ${singles.length} single questions from the 35-question probe, the official FAQ, the odd set and the resolver golden), fresh page per case, cache disabled, no AI and no production writes.`, '',
  '## What the student sees', `- Questions compared: ${questions} · **differences: ${diffs.length}** (answer text, source topic, choice chips, buttons, schedule rows) · Rust fallbacks to JS (errors): ${errors}`,
  ...(diffs.length ? ['', '| question | step | JS | Rust |', '|---|---|---|---|', ...diffs.slice(0, 15).map(d => `| ${d.q.replace(/\|/g, '/')} | ${d.step} | ${d.js.replace(/\|/g, '/')} | ${d.rust.replace(/\|/g, '/')} |`)] : []), '',
  '## Time per call inside the page (microseconds, mean) — COARSE: the browser clock is ~0.1 ms, and the first Rust resolver call includes the index build; see the micro-benchmark and session test for speed', '| function | calls (JS / Rust) | JS µs | Rust µs | Rust/JS |', '|---|---|---|---|---|',
  ...fns.map(f => `| ${f} | ${fnJs.n[f] || 0} / ${fnRust.n[f] || 0} | ${f1(mean(fnJs, f))} | ${f1(mean(fnRust, f))} | ${f1(mean(fnRust, f) / mean(fnJs, f))}× |`), '',
  '## Click to answer (ms, whole page incl. DOM)', '| | p50 | p95 | max |', '|---|---|---|---|',
  `| JS | ${f1(pct(e2e('js'), .5))} | ${f1(pct(e2e('js'), .95))} | ${f1(Math.max(...e2e('js')))} |`, `| Rust | ${f1(pct(e2e('rust'), .5))} | ${f1(pct(e2e('rust'), .95))} | ${f1(Math.max(...e2e('rust')))} |`, '',
  '## One-time costs (median over cases)', `- wasm init: JS engine ${f1(med('js', 'wasmInitMs'))} ms · Rust engine ${f1(med('rust', 'wasmInitMs'))} ms (the wasm loads in both modes; kb_search and route_task use it)`,
  `- Rust resolver build (indexing ${'379'} programmes): ${f1(med('rust', 'resolverBuildMs'))} ms, once per page`, `- wasm download (compressed, from the dev server): ${wasmBytes} bytes`];
console.log('\n' + report.join('\n'));
mkdirSync('/tmp/rw_ab', { recursive: true }); writeFileSync('/tmp/rw_ab/last.json', JSON.stringify({ diffs, fnJs, fnRust, e2e: { js: e2e('js'), rust: e2e('rust') } }));
if (!process.argv.includes('--no-write')) { const dir = join(root, 'benchmark/engine/results'); mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir).filter(f => /^\d{3}_/.test(f)).length + 1; writeFileSync(join(dir, `${String(n).padStart(3, '0')}_${new Date().toISOString().slice(0, 10)}.md`), report.join('\n') + '\n'); }
cleanup(); process.exit(diffs.length || errors ? 1 : 0);
