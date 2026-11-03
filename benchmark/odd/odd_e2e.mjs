// Oddly-phrased questions on a real page (fresh page per question, dead ?api= port so nothing reaches the production kernel).
// Scores which KB entry the student sees against benchmark/odd/odd_questions.json, and whether the AI understand step was used.
//   node benchmark/odd/odd_e2e.mjs --url "http://127.0.0.1:8791/chatbot.html?llm=http://127.0.0.1:8793" [--label ai] [--out file.json]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot', LABEL = arg('--label') || 'run', OUT = arg('--out') || `/tmp/rw_odd/${LABEL}.json`;
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SET = JSON.parse(readFileSync(join(root, 'benchmark/odd/odd_questions.json'), 'utf8')).items;
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')), TITLE = Object.fromEntries(KB.map(e => [e.id, e.title]));
const PORT = 9481, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-odd-'));
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
const res = [];
for (const it of SET) {
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 80; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  const r = await ev(`new Promise(done => { const chat = document.getElementById('chat'), n0 = chat.querySelectorAll('.msg.b').length, t0 = performance.now();
    document.getElementById('q').value = ${JSON.stringify(it.q)}; document.getElementById('send').click();
    const tick = () => { const b = [...chat.querySelectorAll('.msg.b')], l = b[b.length - 1];
      if (b.length > n0 && l && !l.querySelector('.typing')) { const evc = document.getElementById('ev-list')?.firstElementChild?.textContent || '';
        done({ ms: Math.round(performance.now() - t0), topic: ((l.querySelector('.topic') || {}).textContent || '').replace(/^(?:ที่มา|หัวข้อ|อ้างอิง):\\s*/, '').trim(),
          ai: /AI แปลงคำถาม/.test(evc), text: l.innerText.replace(/\\s+/g, ' ').slice(0, 100) }); return; }
      if (performance.now() - t0 > 20000) { done({ ms: 20000, timeout: true, text: '(timeout)' }); return; } setTimeout(tick, 25); }; tick(); })`);
  const gold = it.gold.map(g => TITLE[g]);
  const kind = r.timeout ? 'timeout' : gold.length ? (r.topic ? (gold.includes(r.topic) ? 'right entry' : 'wrong entry') : 'no entry') : (r.topic ? 'answered off-topic' : 'correctly declined');
  res.push({ q: it.q, kind, shown: r.topic || '', ai: !!r.ai, ms: r.ms, text: r.text });
  console.log(`${kind.padEnd(20)} ${r.ai ? 'AI' : '  '} ${String(r.ms).padStart(5)} ms  ${it.q}${r.topic ? '  -> ' + r.topic : ''}`);
}
writeFileSync(OUT, JSON.stringify(res, null, 1));
const c = k => res.filter(x => x.kind === k).length, inD = res.filter((_, i) => SET[i].gold.length).length;
console.log(`\n[${LABEL}] in-manual n=${inD}: right ${c('right entry')} · wrong ${c('wrong entry')} · no entry ${c('no entry')} | must-decline n=${res.length - inD}: declined ${c('correctly declined')} · answered ${c('answered off-topic')} | timeouts ${c('timeout')} | AI step used ${res.filter(x => x.ai).length}`);
cleanup(); process.exit(0);
