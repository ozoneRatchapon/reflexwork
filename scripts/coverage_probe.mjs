#!/usr/bin/env node
// Coverage probe: asks every question in benchmark/coverage/beginner_questions.txt on a page (fresh page per question, so one
// miss cannot colour the next) and reports WHAT KIND of answer came back + how long it took. Writes an auto-numbered result file.
//   node scripts/coverage_probe.mjs [--url http://127.0.0.1:8000/chatbot.html] [--no-write]
// Needs Node >= 22 and Chrome (CHROME=/path). Uses a dead ?api= port: nothing is written to the production kernel.
// It does NOT know the correct answers: "answered" means the page gave an answer of that kind, not that it is right. Pair with the owner's list.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot';
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const QS = readFileSync(join(root, 'benchmark/coverage/beginner_questions.txt'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const PORT = 9455, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-cov-'));
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
const KINDS = ['answer from the knowledge base', 'programme card / fee', 'finder (narrow the list)', 'asks which one', 'not understood', 'small talk', 'staff hand-off', 'other'];
const classify = r => r.notUnderstood ? 'not understood' : r.finder ? 'finder (narrow the list)' : r.programme ? 'programme card / fee' : r.clarify ? 'asks which one' : r.handoff ? 'staff hand-off' : r.topic ? 'answer from the knowledge base' : r.smalltalk ? 'small talk' : 'other';
const rows = [];
for (const q of QS) {
  await send('Page.navigate', { url: URL_ });
  // ready = input enabled AND the programme catalogue has finished loading (on a real network it arrives after the input is enabled;
  // asking earlier gets a different, knowledge-base-only answer and makes the probe flaky)
  for (let i = 0; i < 80; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  await wait(150);
  const r = await ev(`new Promise(res => { const chat = document.getElementById('chat'), n0 = chat.querySelectorAll('.msg.b').length, t0 = performance.now();
    const i = document.getElementById('q'); i.value = ${JSON.stringify(q)}; document.getElementById('send').click();
    const tick = () => { const b = [...chat.querySelectorAll('.msg.b')]; const l = b[b.length - 1];
      if (b.length > n0 && l && !l.querySelector('.typing')) { const T = l.innerText.replace(/\\s+/g, ' '), ms = Math.round(performance.now() - t0);
        const ctx = l.textContent + ' ' + (document.getElementById('ev-list') ? document.getElementById('ev-list').firstElementChild?.textContent || '' : '');
        res({ ms, text: T.slice(0, 90), topic: !!l.querySelector('.topic'), notUnderstood: /ผมยังไม่เข้าใจคำถามนี้/.test(T), finder: /ช่วยเลือกหลักสูตร/.test(ctx) && !/ตรงหลักสูตร/.test(ctx), programme: /ตรงหลักสูตร|ถามต่อจากหลักสูตรก่อนหน้า|ตีความว่าถามเรื่อง/.test(ctx + T), clarify: /ไม่แน่ใจว่าหมายถึงข้อไหน|คุณอาจหมายถึง|ขอถามก่อน|คำตอบไม่เหมือนกัน|กว้างไปหน่อย|ช่วยระบุ/.test(T), handoff: /ติดต่อเจ้าหน้าที่โดยตรง/.test(T) && !/ผมยังไม่เข้าใจ/.test(T), smalltalk: /คุยทั่วไป/.test(ctx), followups: l.querySelectorAll('.followups .dis').length, hasNext: !!l.querySelector('.dislist .dis, .followups .dis, [data-fk], .golink') });
        return; }
      if (performance.now() - t0 > 20000) { res({ ms: 20000, text: '(timeout)', other: true }); return; } setTimeout(tick, 25); };
    tick(); })`);
  r.kind = classify(r); rows.push({ q, ...r });
  console.log(`${r.kind.padEnd(32)} ${String(r.ms).padStart(5)} ms  ${q}`);
}
const n = rows.length, cnt = k => rows.filter(r => r.kind === k).length;
const ms = rows.map(r => r.ms).sort((a, b) => a - b), p = f => ms[Math.min(n - 1, Math.floor(f * n))];
const dead = rows.filter(r => !r.hasNext).length;
const lines = [`# Coverage probe — ${new Date().toISOString().slice(0, 10)}`, '', `Page: ${BASE} · questions: ${n} (benchmark/coverage/beginner_questions.txt) · fresh page per question · "answered" = a page of that kind came back, NOT that it is correct (no owner-confirmed key yet).`, '',
  '| kind of response | questions |', '|---|---|', ...KINDS.map(k => `| ${k} | ${cnt(k)} |`), '',
  `Time to final answer (deterministic paths; no LLM in these questions): p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · max ${ms[n - 1]} ms`,
  `Dead ends (response with no button/suggestion to continue): ${dead} of ${n}`, '', '| question | kind | ms | first words |', '|---|---|---|---|', ...rows.map(r => `| ${r.q} | ${r.kind} | ${r.ms} | ${String(r.text).replace(/\|/g, '/')} |`)];
console.log('\n' + lines.slice(2, 14).join('\n'));
if (!process.argv.includes('--no-write')) {
  const dir = join(root, 'benchmark/coverage/results'); mkdirSync(dir, { recursive: true });
  const next = String(Math.max(0, ...readdirSync(dir).map(f => parseInt(f, 10)).filter(Number.isFinite)) + 1).padStart(3, '0');
  const file = join(dir, `${next}_${new Date().toISOString().slice(0, 10)}.md`); writeFileSync(file, lines.join('\n') + '\n'); console.log('wrote', file);
}
cleanup(); process.exit(0);
