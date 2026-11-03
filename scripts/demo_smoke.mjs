#!/usr/bin/env node
// Pre-show check: drives the LIVE chatbot in headless Chrome through the demo, step by step, and says what works.
//   node scripts/demo_smoke.mjs [--url https://reflexwork.pages.dev/chatbot] [--require-llm] [--mobile]
// Needs: Node >= 22 (global WebSocket) and Google Chrome (set CHROME=/path/to/chrome if it is not the macOS default).
// Safe to run against production: the kernel API is pointed at a dead port (?api=...), so no gap-log entry, vote or policy update is
// written. The only live call that leaves a trace is the LLM step (a Gemini request through the proxy; no state is stored).
// Exit code 1 if any hard check fails. "!" = warning (e.g. LLM fell back to the KB text, data older than 7 days).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot';
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';   // no writes to the production kernel
const REQUIRE_LLM = process.argv.includes('--require-llm');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-smoke-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });

let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); up = true; } catch { await wait(250); } }
if (!up) { console.error('Chrome did not start (set CHROME=/path/to/chrome)'); process.exit(2); }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [], llmCalls = [], llmReq = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  // what the LLM proxy REALLY answered (the page shows the "KB-grounded" badge before the AI replies, and silently falls back to the KB text if it fails)
  if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST' && /\/llm$/.test(new URL(m.params.request.url).pathname)) llmReq.set(m.params.requestId, 1);
  if (m.method === 'Network.loadingFailed' && llmReq.has(m.params.requestId)) llmCalls.push({ failed: m.params.errorText || 'failed' });
  if (m.method === 'Network.loadingFinished' && llmReq.has(m.params.requestId)) send('Network.getResponseBody', { requestId: m.params.requestId }).then(b => { try { llmCalls.push(JSON.parse(b.body)); } catch { llmCalls.push({ failed: 'unreadable body' }); } });
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;

let hard = 0, warn = 0;
const line = (mark, name, extra = '') => console.log(`${mark} ${name}${extra ? '  ' + extra : ''}`);
const ok = (name, extra) => line('✓', name, extra);
const bad = (name, extra) => { hard++; line('✗', name, extra); };
const soft = (name, extra) => { warn++; line('!', name, extra); };

// ask a question, wait until the answer is final (typing indicator gone), return what the user sees
async function ask(q, maxMs = 40000) {
  const before = await ev(`document.querySelectorAll('#chat .msg.b').length`);
  await ev(`(()=>{ const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click(); return 1; })()`);
  const t0 = Date.now(); await wait(900);
  while (Date.now() - t0 < maxMs) {
    const st = await ev(`(()=>{ const n=[...document.querySelectorAll('#chat .msg.b')]; const l=n[n.length-1]; return { n:n.length, typing:!!(l&&l.querySelector('.typing')) }; })()`);
    if (st.n > before && !st.typing) break; await wait(400);
  }
  const r = await ev(`(()=>{ const n=[...document.querySelectorAll('#chat .msg.b')], l=n[n.length-1]; const c=document.querySelector('.ev-card');
    return { text:l.innerText.replace(/\\s+/g,' '), links:[...l.querySelectorAll('a.inl')].map(a=>a.textContent+' -> '+a.href), buttons:[...l.querySelectorAll('a.golink')].map(a=>a.innerText.trim()), chips:[...l.querySelectorAll('.dis')].length, ev:(c?c.innerText:'').replace(/\\s+/g,' ') }; })()`);
  return { ...r, ms: Date.now() - t0 };
}
const has = (r, ...subs) => subs.every(s => r.text.includes(s));

if (process.argv.includes('--mobile')) await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });   // rehearse as a phone
await send('Runtime.enable'); await send('Network.enable'); await send('Page.navigate', { url: URL_ }); await wait(1500);
for (let i = 0; i < 40 && await ev(`document.getElementById('q').disabled !== false`); i++) await wait(500);
console.log(`\nDemo smoke test - ${BASE}\n`);

// 0) the page and its data
const prog = await ev(`fetch('./programmes.json').then(r=>r.json()).then(d=>({count:d.count, at:d.fetched_at, year:d.year})).catch(()=>null)`);
if (!prog) bad('programmes.json loads'); else {
  const age = Math.floor((Date.now() - Date.parse(prog.at)) / 86400000);
  ok(`programme catalogue: ${prog.count} programmes, fetched ${prog.at} (year ${prog.year})`);
  age > 7 ? soft(`catalogue is ${age} days old - statuses may have changed`, '-> gh workflow run programmes-refresh.yml, merge the PR it opens, then submissions/deploy_pages.sh main') : ok(`catalogue age ${age} day(s)`);
}
const leak = await ev(`fetch('./knowledge/registration_2569.md?nc='+Math.random()).then(r=>r.headers.get('content-type')||'').catch(()=>'err')`);
/markdown/.test(leak) ? bad('knowledge/ is NOT served (private drafts)', 'IT IS SERVED - stop and redeploy from committed files') : ok('knowledge/ is not served');

// 1) programme card
let r = await ask('อยากสมัครเรียนจิตวิทยาคลินิก');
has(r, 'จิตวิทยาคลินิก', 'สถานะบนเว็บบัณฑิตวิทยาลัย') && r.buttons.some(b => /ประกาศ|หน้ารายละเอียด/.test(b)) ? ok('1. "อยากสมัครเรียนจิตวิทยาคลินิก" -> programme card with status and official buttons', `${r.ms} ms`) : bad('1. programme card', r.text.slice(0, 100));
// 2) follow-up
r = await ask('แล้วค่าเทอมล่ะ');
has(r, 'ตีความว่าถามเรื่อง', 'ค่าธรรมเนียม', 'จิตวิทยาคลินิก') ? ok('2. "แล้วค่าเทอมล่ะ" -> understood as a follow-up about the same programme', `${r.ms} ms`) : bad('2. follow-up question', r.text.slice(0, 100));
// 3) fees of a programme
r = await ask('ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก');
has(r, 'เหมาจ่าย', 'บาท/ภาคการศึกษา') ? ok('3. fee table of one programme (Thai and international students)', `${r.ms} ms`) : bad('3. fee table', r.text.slice(0, 100));
// 4) undecided
r = await ask('เรียนไรดี');
has(r, 'อยากเรียนระดับไหน') && r.chips >= 4 ? ok('4. "เรียนไรดี" -> finder (level, faculty, open now ...)', `${r.ms} ms`) : bad('4. finder', r.text.slice(0, 100));
// 5) sloppy typing
r = await ask('เรียนรายยย');
has(r, 'ผมยังไม่แน่ใจ') && r.chips >= 4 ? ok('5. "เรียนรายยย" -> no dead end: finder offered', `${r.ms} ms`) : bad('5. typo rescue', r.text.slice(0, 100));
r = await ask('กายอุปกณ์');
has(r, 'กายอุปกรณ์') ? ok('6. "กายอุปกณ์" (typo) -> the right programmes as a picker', `${r.ms} ms`) : bad('6. misspelt programme name', r.text.slice(0, 100));
// 7) links in answers
r = await ask('ลืมรหัสผ่านเข้า e-Thesis');
r.links.some(l => /e-Thesis -> https:\/\/graduate\.mahidol\.ac\.th\/ethesis\//.test(l)) && r.links.some(l => /account\.mahidol\.ac\.th/.test(l)) ? ok('7. answer text carries clickable official links (e-Thesis, account.mahidol.ac.th)', `${r.ms} ms`) : bad('7. clickable links', JSON.stringify(r.links));
// 8) the LLM, used only to rephrase a mid-strength KB match
llmCalls.length = 0;
r = await ask('ช่วยแนะนำเรื่องส่ง Turnitin Originality Report', 45000);
for (let i = 0; i < 20 && !llmCalls.length; i++) await wait(500);
const call = llmCalls[llmCalls.length - 1];
if (BASE.includes('ai=off')) (!call && has(r, 'Turnitin') ? ok('8. AI-off mode: answered from the knowledge base, the AI proxy was not called', `${(r.ms / 1000).toFixed(1)} s`) : bad('8. AI-off mode', call ? 'the proxy WAS called' : r.text.slice(0, 100)));
else if (call && (call.source === 'gemini' || call.source === 'ollama')) ok(`8. advice question -> the LLM proxy answered (source: ${call.source}) and the page showed its rephrasing`, `${(r.ms / 1000).toFixed(1)} s`);
else (REQUIRE_LLM ? bad : soft)('8. the LLM did NOT answer - the page showed the KB text instead (the demo still works)', call ? (call.failed ? `request failed: ${call.failed} (CORS from a non-production origin?)` : `source: ${call.source}, detail: ${JSON.stringify(call.detail)}`) : 'no request to /llm was made');
// 9) the meter and the thumbs
const m0 = await ev(`document.getElementById('ratio-pct').innerText`);
await ev(`(()=>{ const b=[...document.querySelectorAll('.fb-b')].filter(x=>/ไม่/.test(x.innerText)).pop(); if(b) b.click(); return !!b; })()`); await wait(1200);
const m1 = await ev(`({pct:document.getElementById('ratio-pct').innerText, note:document.getElementById('ratio-note').innerText})`);
/^\d+% \(\d+\/\d+\)$/.test(m0) && m1.pct === m0 && /ความพอใจ/.test(m1.note) ? ok(`9. meter is a count (${m0}) and a 👎 vote does not move it`) : bad('9. meter / thumbs', `${m0} -> ${m1.pct} | ${m1.note.slice(0, 60)}`);
// 9a) career-first question: narrows the official list by an area of interest, never predicts jobs/pay, points to the university's own tool
r = await ask('อยากทำเกี่ยวกับคอม');
const carHtml = await ev(`document.querySelector('#chat .msg.b:last-child').innerHTML`);
has(r, 'ไม่ได้ทำนายงานหรือรายได้', 'คอมพิวเตอร์') && /suggest-program\.mahidol\.ac\.th/.test(carHtml) ? ok('9a. "อยากทำเกี่ยวกับคอม" -> programmes narrowed by area + link to the university\'s career-based tool', `${r.ms} ms`) : bad('9a. career-first question', r.text.slice(0, 100));
// 9b) suggestions while typing, and "ask next" after an answer
const sg = await ev(`(()=>{ const i=document.getElementById('q'); i.value='ลาพัก'; i.dispatchEvent(new Event('input')); const b=document.getElementById('sg'); return b && !b.hidden ? b.querySelectorAll('.sg-i').length : 0; })()`);
sg >= 1 ? ok(`9b. typing "ลาพัก" shows ${sg} suggestion(s) above the input`) : bad('9b. typeahead', 'no suggestions shown');
await ev(`(()=>{ const i=document.getElementById('q'); i.value=''; i.dispatchEvent(new Event('input')); return 1; })()`);
r = await ask('ลาพักการเรียนทำยังไง');
const fu = await ev(`document.querySelectorAll('#chat .msg.b:last-child .followups .dis').length`);
fu >= 1 ? ok(`9c. after a knowledge-base answer the page offers ${fu} "ask next" question(s)`) : soft('9c. no "ask next" chips after a KB answer (the answer may have been a clarification)');
// 9e) a yes/no question with a premise about fees must not be confirmed
r = await ask('ค่าเทอมปริญญาโทฟรีใช่ไหม');
has(r, 'ยืนยันไม่ได้ว่าไม่มีค่าใช้จ่าย') && !/ฟรีครับ|ใช่ครับ/.test(r.text) ? ok('9e. "ค่าเทอมปริญญาโทฟรีใช่ไหม" -> does not confirm; opens the fee finder', `${r.ms} ms`) : bad('9e. premise question', r.text.slice(0, 100));
// 9d) what a curious visitor types: markup must stay text. (Safe payload: sets a flag instead of opening a dialog.)
await ev(`(()=>{ window.__xss = 0; const i=document.getElementById('q'); i.value='<img src=x onerror=window.__xss=1><b>x</b>'; document.getElementById('send').click(); return 1; })()`);
await wait(2500);
const xss = await ev(`({ flag: window.__xss, imgs: document.querySelectorAll('#chat img[src=x], #ev-list img[src=x]').length, bold: document.querySelectorAll('#chat .msg.u b').length, shown: ([...document.querySelectorAll('#chat .msg.u')].pop()||{}).textContent })`);
xss.flag === 0 && xss.imgs === 0 && xss.bold === 0 && /<img/.test(xss.shown || '') ? ok('9d. typed HTML stays text (no element created, no handler ran)') : bad('9d. typed markup was interpreted', JSON.stringify(xss));
// 10) the page itself
errs.length ? bad('10. no script errors on the page', errs.slice(0, 3).join(' | ')) : ok('10. no script errors on the page');

console.log(`\n${hard ? '✗ ' + hard + ' hard failure(s)' : '✓ all hard checks passed'}${warn ? `, ${warn} warning(s)` : ''}`);
ws.close(); cleanup(); process.exit(hard ? 1 : 0);
