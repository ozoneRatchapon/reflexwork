#!/usr/bin/env node
// Route contract (plan 009 step 0): which branch of the chat's decision order (_askCore, chatbot.html) answers each question. The page stamps every
// bot bubble with data-route (ROUTE_NAME); this records it per question in a real headless Chrome (AI off, kernel unreachable: nothing is sent anywhere)
// and later checks it. The Rust port of the decision order (`decide_route`) must reproduce this file exactly.
//   node benchmark/golden/route_golden.mjs --write [--out benchmark/golden/route.json]     record (≈15 min for ~1,450 questions + 14 sessions)
//   node benchmark/golden/route_golden.mjs --update                                          record only the entries the golden does not have yet, drop the ones no longer in the pool
//   node benchmark/golden/route_golden.mjs --check [--limit N]                               compare (--limit: every k-th question, for CI)
// Pool: the test sets (official FAQ th + en, odd, English held-out, beginner, eval52) + the generated questions (benchmark/synth) + hand-written
// follow-up SESSIONS (state carries over inside a session). Each single question is preceded by "เริ่มใหม่" (the page's own reset of the programme in
// focus and the picked topic), so one question never inherits the previous one. The golden is tied to the manual: rebuild it when knowledge-index.json,
// programmes.json or the decision order changes ON PURPOSE; an unexpected difference is a regression (or a branch nobody labelled: route "unrouted").
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8'), UI = join(root, 'submissions/ui');
const argv = process.argv.slice(2), has = k => argv.includes(k), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const OUT = opt('--out') || join(root, 'benchmark/golden/route.json'), LIMIT = Number(opt('--limit') || 0);
const TRY = has('--try') ? (() => { const out = []; for (let i = argv.indexOf('--try') + 1; i < argv.length && !argv[i].startsWith('--'); i++) out.push(argv[i]); return out; })() : null, TRYMODE = opt('--mode') || 'ai_off';
if (!has('--write') && !has('--check') && !has('--update') && !TRY) { console.error('usage: route_golden.mjs --write | --check [--limit N]'); process.exit(2); }

const faq = JSON.parse(R('benchmark/field/faq_questions.json')).items;
const singles = [];
const add = (set, qs) => qs.forEach(q => q && q.trim() && singles.push({ set, q: q.trim() }));
add('faq_th', faq.map(x => x.th)); add('faq_en', faq.map(x => x.en));
add('odd', JSON.parse(R('benchmark/odd/odd_questions.json')).items.map(x => x.q));
add('en_heldout', JSON.parse(R('benchmark/field/english_heldout.json')).items.map(x => x[0]));
add('beginner', R('benchmark/coverage/beginner_questions.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
add('eval52', [...R('tests/kb_search.test.mjs').matchAll(/^\s*\['([^']+)',\s*(?:null|'[^']*'),\s*'[^']*'\],?$/gm)].map(m => m[1]));
if (existsSync(join(root, 'benchmark/synth/questions_001.json'))) add('synth', JSON.parse(R('benchmark/synth/questions_001.json')).items.map(x => x.q));
// sessions: the state that carries over (the programme in focus, a picked topic, the level) is what the single questions cannot reach
const sessions = [
  ['อยากสมัครเรียนจิตวิทยาคลินิก', 'แล้วค่าเทอมล่ะ', 'แล้วสอบสัมภาษณ์วันไหน'],
  ['ชีวสารสนเทศทางการแพทย์', 'แล้วค่าเทอมล่ะ', 'เริ่มใหม่', 'แล้วค่าเทอมล่ะ'],
  ['เรียนไรดี', 'ปริญญาโท', 'อยากทำเกี่ยวกับคอม'],
  ['ค่าเทอมเท่าไร', 'ค่าเทอมพยาบาล', 'แล้วทุนล่ะ'],
  ['ลงทะเบียนเมื่อไหร่', 'ภาคปลาย 2569'],
  ['ติดปัญหา', 'เข้าระบบไม่ได้', 'ช่วยด้วย'],
  ['สวัสดี', 'ขอบคุณ', 'ส่งรูปเล่มภายในกี่วัน', 'แล้วถ้าส่งช้าล่ะ'],
  ['ตรวจบทคัดย่อกี่วัน', 'ค่าตรวจบทคัดย่อเท่าไหร่', 'ตรวจสอบสถานะการส่งตรวจบทคัดย่อได้อย่างไร'],
  ['อยากเรียนต่อ ป เอก วิศวะคอม', 'แล้วทุนล่ะ'],
  ['what is the tuition fee for nursing', 'how do I apply', 'when is the deadline'],
  ['เครียดมาก ไม่ไหวแล้ว', 'ขอดูข้อมูลของฉัน', 'ลาพักต้องทำอย่างไร'],
  ['ปีนี้เปิดรับสมัครรอบไหนบ้าง', 'รอบ 3 ปิดรับเมื่อไหร่', 'รอบ 1 ล่ะ'],
  ['TOEFL ITP ค่าสมัครเท่าไร', 'ขอรับผลคะแนนอย่างไร', 'ส่งทางไปรษณีย์ได้ไหม'],
  ['พิมพ์อะไรก็ได้ที่ไม่เกี่ยวกับคู่มือ', 'ค่าเทอมฟรีใช่ไหม', 'ป.โท ฟรีไหม'],
];
// branches the sets above never reach: probes written for them (a branch with no sample is a hole in the contract). Mode: ai_off (default) |
// ai_on (the AI branches are on; the proxy is a dead port, so they fall back to the manual text) | nocat (programmes.json answers 500)
const probes = [
  ['ai_off', ['ok', 'https://example.com', '1234', 'มีอะไรน่าสนใจบ้าง', 'ควรรู้อะไรบ้างก่อนเริ่ม', 'ขอดูผลการเรียนของฉัน', 'สถานะใบสมัครของฉันเป็นอย่างไร', '你好 请问学费多少', 'こんにちは', 'มีทุนไหม', 'มีหอพักไหม', 'ทุน']],
  ['ai_on', ['ช่วยแนะนำวิธีวางแผนส่งรูปเล่มให้ทันกำหนด', 'แนะนำหน่อยว่าควรเลือกเรียนอะไรดี', 'ควรเตรียมตัวสอบ TOEFL ยังไงดี', 'ช่วยแนะนำการจัดการเวลาทำวิทยานิพนธ์', 'ลองแนะนำวิธีขอทุนหน่อย']],   // understood_by_ai needs a WORKING /rewrite: not reachable without a mock proxy (known hole)
  ['nocat', ['อยากสมัครเรียนจิตวิทยา', 'ค่าเทอมหลักสูตรพยาบาล', 'หลักสูตรอะไรเปิดรับบ้าง']],
];
const items = [...singles.map((s, i) => ({ kind: 'single', set: s.set, qs: [s.q] })),
  ...probes.flatMap(([mode, qs]) => qs.map(q => ({ kind: 'single', set: 'probe', mode, qs: [q] }))), ...sessions.map((qs, i) => ({ kind: 'session', set: 'session', qs }))];
const keyOf = r => JSON.stringify(r.kind === 'session' ? [r.kind, r.qs] : [r.kind, r.mode || 'ai_off', r.qs[0]]);
const goldOld = has('--update') && existsSync(OUT) ? new Map(JSON.parse(readFileSync(OUT, 'utf8')).map(r => [JSON.stringify(r.kind === 'session' ? [r.kind, r.qs] : [r.kind, r.mode || 'ai_off', r.q]), r])) : new Map();
const pick = has('--update') ? items.filter(it => !goldOld.has(keyOf(it))) : TRY ? TRY.map(q => ({ kind: 'single', set: 'try', mode: TRYMODE, qs: [q] })) : LIMIT ? items.filter((_, i) => i % LIMIT === 0) : items;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/chatbot.html';
  if (p === '/programmes.json' && /nocat=1/.test(q.headers.referer || '')) { s.writeHead(500); return s.end(); }
  const f = normalize(join(UI, p)); if (!f.startsWith(UI) || !existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const SP = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), 'rw-route-'));
const chrome = spawn(process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = () => { try { chrome.kill(); } catch {} srv.close(); };
process.on('exit', done);
const wsUrl = await new Promise(res => { let b = ''; chrome.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); });
const tab = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (c, ms = 8000) => { for (let t = 0; t < ms; t += 40) { if (await ev(c)) return true; await wait(40); } return false; };
await send('Page.enable'); await send('Runtime.enable');
// ai=off + a dead kernel/proxy: no gap-log entry, no vote, no AI call; ?now pins nothing - date-dependent routes (time_intent) are decided by words, not by the clock
const URLS = { ai_off: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:9&ai=off`, ai_on: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:9`, nocat: `http://127.0.0.1:${SP}/chatbot.html?nocat=1&api=http://127.0.0.1:9&llm=http://127.0.0.1:9&ai=off` };
let MODE = 'ai_off';
const boot = async () => { await send('Page.navigate', { url: URLS[MODE] }); await until(`!!document.getElementById('q') && !document.getElementById('q').disabled`, 30000); await until(`document.documentElement.classList.contains('agency-pending')===false`, 5000); await wait(300); };
const bots = () => ev(`document.querySelectorAll('#chat .msg.b').length`);
const ask = async q => { const n = await bots();
  await ev(`(()=>{const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click();})()`);
  await until(`document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${n}`); await wait(60);
  return ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); return b ? (b.dataset.route ?? null) : null;})()`); };
const result = []; let n = 0, booted = '';
for (const it of pick) {
  const mode = it.mode || 'ai_off';
  if (mode !== booted || n++ % 60 === 0) { MODE = mode; await boot(); booted = mode; }
  if (it.kind === 'session') { await boot(); const routes = []; for (const q of it.qs) routes.push(await ask(q)); result.push({ kind: 'session', qs: it.qs, routes }); }
  else { await ask('เริ่มใหม่'); result.push({ kind: 'single', set: it.set, ...(it.mode && it.mode !== 'ai_off' ? { mode: it.mode } : {}), q: it.qs[0], route: await ask(it.qs[0]) }); }
}
done();
if (has('--update')) {
  const fresh = new Map(result.map(r => [JSON.stringify(r.kind === 'session' ? [r.kind, r.qs] : [r.kind, r.mode || 'ai_off', r.q]), r]));
  const merged = items.map(it => { const k = keyOf(it); return fresh.get(k) || goldOld.get(k); }).filter(Boolean);
  writeFileSync(OUT, '[\n' + merged.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
  console.log(`updated: ${result.length} recorded, ${merged.length - result.length} kept, ${[...goldOld.keys()].filter(k => !items.some(it => keyOf(it) === k)).length} dropped -> ${OUT}`); process.exit(0);
}
if (TRY) { for (const r of result) console.log(`${(r.route ?? 'null').padEnd(24)} ${r.q}`); process.exit(0); }
const key = r => JSON.stringify(r.kind === 'session' ? [r.kind, r.qs] : [r.kind, r.mode || 'ai_off', r.q]);
const val = r => JSON.stringify(r.kind === 'session' ? r.routes : r.route);
if (has('--write')) {
  const lines = result.map(r => JSON.stringify(r));
  writeFileSync(OUT, '[\n' + lines.join(',\n') + '\n]\n');
  const counts = {}; for (const r of result) for (const x of (r.kind === 'session' ? r.routes : [r.route])) counts[x] = (counts[x] || 0) + 1;
  console.log(`wrote ${result.length} entries -> ${OUT}`); console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(5)} ${k}`).join('\n'));
  process.exit(counts.unrouted || counts.null ? 1 : 0);
}
const gold = new Map(JSON.parse(readFileSync(OUT, 'utf8')).map(r => [key(r), r]));
let diff = 0, missing = 0;
for (const r of result) { const g = gold.get(key(r)); if (!g) { missing++; console.log('not in golden:', key(r).slice(0, 80)); continue; }
  if (val(g) !== val(r)) { diff++; console.log(`DIFF ${key(r).slice(0, 90)}\n   golden ${val(g)}\n   now    ${val(r)}`); } }
console.log(`${result.length} checked${LIMIT ? ` (every ${LIMIT}th)` : ''}: ${diff} differences, ${missing} not in golden`);
process.exit(diff || missing ? 1 : 0);
