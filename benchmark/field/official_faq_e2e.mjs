// End-to-end version of the official-FAQ evaluation: asks the questions on the LIVE page (fresh page per question, dead ?api= port so nothing
// is written to production) and checks which knowledge-base entry the student actually sees ("ที่มา: <title>"), or which other kind of answer.
//   node benchmark/field/official_faq_e2e.mjs [--url https://reflexwork.pages.dev/chatbot] [--lang th|en] [--out /tmp/rw_faq/e2e_th.json]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot', LANG = arg('--lang') || 'th', OUT = arg('--out') || `/tmp/rw_faq/e2e_${LANG}.json`;
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FAQ = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items;
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')), TITLE = Object.fromEntries(KB.map(e => [e.id, e.title]));
const PORT = 9473, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-e2e-'));
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
for (const it of FAQ.filter(x => x.student)) {
  const q = LANG === 'en' ? it.en : it.th; if (!q) continue;
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 80; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
  const r = await ev(`new Promise(done => { const chat = document.getElementById('chat'), n0 = chat.querySelectorAll('.msg.b').length, t0 = performance.now();
    document.getElementById('q').value = ${JSON.stringify(q)}; document.getElementById('send').click();
    const tick = () => { const b = [...chat.querySelectorAll('.msg.b')], l = b[b.length - 1];
      if (b.length > n0 && l && !l.querySelector('.typing')) { const T = l.innerText.replace(/\\s+/g, ' ');
        done({ ms: Math.round(performance.now() - t0), topic: ((l.querySelector('.topic') || {}).textContent || '').replace(/^(?:ที่มา|หัวข้อ|อ้างอิง):\\s*/, '').trim(), text: T.slice(0, 120),
          notUnderstood: /จับใจความคำถามนี้ไม่ได้|I couldn't find this|ผมยังไม่เข้าใจ/.test(T), finder: /ช่วยเลือกหลักสูตร/.test(l.textContent + (document.getElementById('ev-list') ? document.getElementById('ev-list').firstElementChild?.textContent : '')),
          asks: /ไม่แน่ใจว่าหมายถึงข้อไหน|คุณอาจหมายถึง|ในคู่มือมีหลายหัวข้อ|ในคู่มือมีหัวข้อนี้|ขอถามเพิ่ม|Which one/.test(T) }); return; }
      if (performance.now() - t0 > 20000) { done({ ms: 20000, text: '(timeout)', timeout: true }); return; } setTimeout(tick, 25); }; tick(); })`);
  const gold = it.gold_kb_ids.map(g => TITLE[g]);
  const kind = r.timeout ? 'timeout' : r.topic ? (gold.length ? (gold.includes(r.topic) ? 'right entry' : 'wrong entry') : 'entry shown (not in gold)') : r.notUnderstood ? 'declined / not understood' : r.asks ? 'asked which one' : r.finder ? 'programme finder' : 'other';
  res.push({ id: it.id, q, kind, shown: r.topic, ms: r.ms, covered: gold.length > 0 }); process.stdout.write(`${it.id.padStart(4)} ${kind.padEnd(26)} ${q.slice(0, 50)}\n`);
}
writeFileSync(OUT, JSON.stringify(res, null, 1));
const cov = res.filter(x => x.covered), n = cov.length, c = k => cov.filter(x => x.kind === k).length;
console.log(`\n[${LANG}] covered items n=${n}: right entry ${c('right entry')} (${Math.round(100 * c('right entry') / n)}%) · wrong entry ${c('wrong entry')} · asked ${c('asked which one')} · declined ${c('declined / not understood')} · finder ${c('programme finder')} · other ${c('other')}`);
cleanup(); process.exit(0);
