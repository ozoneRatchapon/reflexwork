#!/usr/bin/env node
// Clicks-to-answer: drives the page through the main user journeys and counts the user ACTIONS (typed questions + clicks) and the
// page time until the answer that completes the journey appears. Writes an auto-numbered result to benchmark/journeys/results/.
//   node scripts/journeys.mjs [--url http://127.0.0.1:8000/chatbot.html] [--mobile] [--no-write]
// "success" is a text check on the final answer (e.g. the fee table is there); it shows the journey WORKS, not that the content is right.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot';
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';
const MOBILE = process.argv.includes('--mobile');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9466, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-jr-'));
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
if (MOBILE) await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
// a step = type a question | click something inside the last bot answer. Returns page ms until the answer settles (typing dots gone).
const step = s => ev(`new Promise(res => { const chat = document.getElementById('chat'), t0 = performance.now(), n0 = chat.querySelectorAll('.msg.b').length;
  const last = () => { const b = [...chat.querySelectorAll('.msg.b')]; return b[b.length - 1]; };
  const before = last() ? last().innerHTML : '';
  ${s.ask ? `const i = document.getElementById('q'); i.value = ${JSON.stringify(s.ask)}; document.getElementById('send').click();`
            : `const els = [...last().querySelectorAll(${JSON.stringify(s.click)})]; const el = ${s.text ? `els.find(x => ${JSON.stringify(s.text)} === '' || new RegExp(${JSON.stringify(s.text)}).test(x.innerText))` : 'els[0]'}; if (!el) { res({ ms: -1, miss: true }); return; } el.click();`}
  const tick = () => { const l = last(); const changed = ${s.ask ? 'chat.querySelectorAll(".msg.b").length > n0' : 'true'};
    if (changed && l && !l.querySelector('.typing') && (${s.ask ? 'true' : 'l.innerHTML !== before || chat.querySelectorAll(".msg.b").length > n0'})) { res({ ms: Math.round(performance.now() - t0) }); return; }
    if (performance.now() - t0 > 20000) { res({ ms: 20000, miss: true }); return; } setTimeout(tick, 25); };
  setTimeout(tick, 30); })`);
const JOURNEYS = [
  { name: 'Know the programme: its fee table', steps: [{ ask: 'ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก' }], ok: /เหมาจ่าย|บาท\/ภาคการศึกษา/ },
  { name: 'Undecided: level > faculty > programme card', steps: [{ ask: 'เรียนไรดี' }, { click: '[data-fk=level]', text: 'ปริญญาโท' }, { click: '[data-fk=faculty]' }, { click: '[data-code]' }], ok: /สถานะบนเว็บบัณฑิตวิทยาลัย|ยังไม่พบประกาศ/ },
  { name: 'Career-first: "อยากทำเกี่ยวกับคอม" > level > programme card', steps: [{ ask: 'อยากทำเกี่ยวกับคอม' }, { click: '[data-fk=level]', text: 'ปริญญาโท' }, { click: '[data-code]' }], ok: /สถานะบนเว็บบัณฑิตวิทยาลัย|ยังไม่พบประกาศ/ },
  { name: 'Thesis deadline', steps: [{ ask: 'ส่งวิทยานิพนธ์เมื่อไหร่' }], ok: /21 วัน|21 days/ },
  { name: 'Turnitin report', steps: [{ ask: 'Turnitin เกิน 25% ทำอย่างไร' }], ok: /Turnitin/ },
  { name: 'Reach the Graduate School', steps: [{ ask: 'ติดต่อบัณฑิตวิทยาลัยได้ที่ไหน' }], ok: /@gradmu|โทร/ },
];
const rows = [];
for (const j of JOURNEYS) {
  await send('Page.navigate', { url: URL_ });
  // ready = input enabled AND the programme catalogue has finished loading (on a real network it arrives after the input is enabled;
  // asking earlier gets a different, knowledge-base-only answer and makes the probe flaky)
  for (let i = 0; i < 80; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  await wait(150);
  let ms = 0, miss = false;
  for (const s of j.steps) { const r = await step(s); if (r.miss) { miss = true; break; } ms += r.ms; }
  const text = await ev(`[...document.querySelectorAll('#chat .msg.b')].pop().innerText.replace(/\\s+/g, ' ')`);
  const ok = !miss && j.ok.test(text);
  rows.push({ name: j.name, actions: j.steps.length, ms, ok });
  console.log(`${ok ? '✓' : '✗'} ${String(j.steps.length).padStart(2)} action(s) ${String(ms).padStart(5)} ms  ${j.name}`);
}
const bad = rows.filter(r => !r.ok).length;
if (!process.argv.includes('--no-write')) {
  const dir = join(root, 'benchmark/journeys/results'); mkdirSync(dir, { recursive: true });
  const next = String(Math.max(0, ...readdirSync(dir).map(f => parseInt(f, 10)).filter(Number.isFinite)) + 1).padStart(3, '0');
  const file = join(dir, `${next}_${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(file, [`# Journeys — ${new Date().toISOString().slice(0, 10)}`, '', `Page: ${BASE}${MOBILE ? ' (390x844 mobile)' : ''}. Action = a typed question or a click. ms = page time for all steps (not the human's thinking time; deterministic paths only).`, '', '| journey | actions | ms | completed |', '|---|---|---|---|', ...rows.map(r => `| ${r.name} | ${r.actions} | ${r.ms} | ${r.ok ? 'yes' : 'NO'} |`), ''].join('\n'));
  console.log('wrote', file);
}
cleanup(); process.exit(bad ? 1 : 0);
