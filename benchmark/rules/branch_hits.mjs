// Which decision branch of the chat answers each test question? Read-only, headless Chrome, AI and kernel OFF (nothing is sent anywhere).
// Run: node benchmark/rules/branch_hits.mjs [out.md]   (~5-8 min for ~390 questions; needs Google Chrome and knowledge-index.json)
// The branch is read from the answer bubble's route label (span.route / .ans lead), normalised to its first words. Same question pool as
// rule_hits.mjs. Each question is asked in a fresh tab state (the chat is reset) so follow-up context from the previous one does not leak.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8'), UI = join(root, 'submissions/ui');
const faq = JSON.parse(R('benchmark/field/faq_questions.json')).items;
const SETS = {
  faq_th: faq.map(x => x.th), faq_en: faq.map(x => x.en),
  odd: JSON.parse(R('benchmark/odd/odd_questions.json')).items.map(x => x.q),
  en_heldout: JSON.parse(R('benchmark/field/english_heldout.json')).items.map(x => x[0]),
  beginner: R('benchmark/coverage/beginner_questions.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')),
  eval52: [...R('tests/kb_search.test.mjs').matchAll(/^\s*\['([^']+)',\s*(?:null|'[^']*'),\s*'[^']*'\],?$/gm)].map(m => m[1]),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/chatbot.html';
  const f = normalize(join(UI, p)); if (!f.startsWith(UI) || !existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const SP = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), 'rw-branch-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = () => { try { chrome.kill(); } catch {} srv.close(); };
const wsUrl = await new Promise(res => { let b = ''; chrome.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); });
const tab = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (c, ms = 8000) => { for (let t = 0; t < ms; t += 50) { if (await ev(c)) return true; await wait(50); } return false; };
await send('Page.enable'); await send('Runtime.enable');
const URL0 = `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:9&ai=off`;
const boot = async () => { await send('Page.navigate', { url: URL0 }); await until(`!!document.getElementById('q') && !document.getElementById('q').disabled`, 30000);
  await until(`typeof PROG_STATE!=='undefined' && PROG_STATE!=='loading'`, 15000); };
await boot();
const label = () => ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b:not(.pending)')].pop(); if(!b) return '';
  const r=b.querySelector('.route'), all=b.innerText.replace(/\\s+/g,' ');
  if(r) return r.innerText.replace(/\\s+/g,' ').trim();
  if(/คุณอาจหมายถึง/.test(all)) return 'KB: ให้เลือกจากหลายหัวข้อ (disambiguate)';
  if(/คำตอบไม่เหมือนกันในแต่ละปีการศึกษา/.test(all)) return 'KB: ถามกลับปี/ภาค (scope)';
  if(/I couldn't find this|จับใจความคำถามนี้ไม่ได้|ขออภัยที่ยังหาคำตอบ|ผมยังไม่แน่ใจว่าหมายถึงหลักสูตรไหน/.test(all)) return 'ไม่เข้าใจ / ส่งต่อเจ้าหน้าที่ (decline)';
  if(/คำนี้กว้างไปหน่อย พบ/.test(all)) return 'หลักสูตร: คำกว้าง ขอให้ระบุ';
  if(b.querySelector('.topic')) return 'KB: ตอบจากคู่มือ (plain)';
  return 'อื่น: '+all.slice(0,40); })()`);
const norm = t => t.replace(/score\s*[\d.]+/g, '').replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').replace(/·.*$/, '').trim().slice(0, 60);
const rows = []; let n = 0;
for (const [set, qs] of Object.entries(SETS)) for (const q of qs) {
  if (++n % 40 === 0) { await boot(); }   // reload now and then: keeps the DOM small
  await ev(`(()=>{ if(typeof PCTX!=='undefined') PCTX=null; if(typeof PIN!=='undefined') PIN=null; })()`);   // no follow-up context between questions
  const before = await ev(`document.querySelectorAll('#chat .msg.b:not(.pending)').length`);
  await ev(`(()=>{const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click();})()`);
  await until(`document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${before}`); await wait(150);
  rows.push({ set, q, branch: norm(await label()) });
}
done();
const H = Object.keys(SETS), by = new Map();
for (const r of rows) { const b = by.get(r.branch) || { per: {}, n: 0, ex: [] }; b.n++; b.per[r.set] = (b.per[r.set] || 0) + 1; if (b.ex.length < 2) b.ex.push(r.q); by.set(r.branch, b); }
let md = `# Which branch answers each test question (${rows.length} questions, AI and kernel off)\n\nGenerated by \`node benchmark/rules/branch_hits.mjs\`. Branch = the answer's route label, numbers and quoted words normalised.\n\n`;
md += `| branch (route label) | all | ${H.join(' | ')} | example |\n|---|---|${H.map(() => '---').join('|')}|---|\n`;
for (const [k, b] of [...by].sort((a, c) => c[1].n - a[1].n)) md += `| ${k.replace(/\|/g, '/') || '(no label)'} | ${b.n} | ${H.map(h => b.per[h] || 0).join(' | ')} | ${b.ex.map(x => x.slice(0, 40).replace(/\|/g, '/')).join(' · ')} |\n`;
const out = process.argv[2]; if (out) { writeFileSync(out, md); writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(rows, null, 0)); }
console.log(md); process.exit(0);
