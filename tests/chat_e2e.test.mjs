// End-to-end: the WHOLE chat page in headless Chrome, on both engines (?engine=rust and ?engine=js), against a local mock kernel /
// LLM proxy - nothing is sent to production. Every other test evaluates slices of the page; this one boots it, so load-order errors,
// branch-order regressions ('แล้วค่าเทอมล่ะ' swallowed by the generic fee finder, 3eba860) and DOM wiring are caught.
// Needs Chrome (CHROME_PATH, or the usual macOS / Linux locations); without it the test is SKIPPED (exit 0) and says so.
// Run: node tests/chat_e2e.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), UI = join(root, 'submissions/ui');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && existsSync(p));
if (!CHROME) { console.log('SKIPPED: no Chrome found (set CHROME_PATH)'); process.exit(0); }
if (typeof WebSocket !== 'function') { console.log('SKIPPED: this Node has no global WebSocket (needs Node >= 22)'); process.exit(0); }
if (!existsSync(join(UI, 'knowledge-index.json'))) { console.log('SKIPPED: build the KB first (python3 submissions/build_knowledge_index.py)'); process.exit(0); }

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${String(detail).slice(0, 220)}`)); ok ? pass++ : fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

// --- static server for submissions/ui ---------------------------------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const stat = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname === '/chatbot.preview.html' || pathname === '/dashboard.preview.html') {   // what submissions/deploy_pages.sh stamps on a deploy of any branch except main
    const src = readFileSync(join(UI, pathname.replace('.preview', '')), 'utf8').replace('<head>', '<head><meta name="robots" content="noindex"><meta name="rw-env" content="preview">');
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(src); }
  if (pathname === '/chatbot.stale.html') {   // an old cached wasm without WASM.Router: the page has no other copy of the route order (plan 015 step 4b)
    const src = readFileSync(join(UI, 'chatbot.html'), 'utf8'), stale = src.replace("typeof WASM.Router!=='function'", 'true');
    if (stale === src) { res.writeHead(500); return res.end('chatbot.html: Router check not found'); }
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(stale); }
  const p = normalize(join(UI, pathname));
  if (!p.startsWith(UI) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  try { const body = readFileSync(p); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});

// --- mock kernel + LLM proxy (one port; the page allows loopback overrides) ------------------------------------------------------
let MOCK_REQS = 0;
const MOCK = { rewrite: { delay: 0, body: { queries: [], source: 'gemini' } }, llm: { status: 500 }, gaps: [], live: [] };
const mock = http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  MOCK_REQS++;
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const u = req.url.split('?')[0];
    if (u === '/live-kb') { res.writeHead(200, h); return res.end(JSON.stringify({ entries: MOCK.live })); }
    if (u === '/gap') { MOCK.gaps.push(b); res.writeHead(200, h); return res.end('{}'); }
    if (u === '/rewrite') return setTimeout(() => { res.writeHead(200, h); res.end(JSON.stringify(MOCK.rewrite.body)); }, MOCK.rewrite.delay);
    if (u === '/llm') { res.writeHead(MOCK.llm.status, h); return res.end(MOCK.llm.status === 200 ? JSON.stringify(MOCK.llm.body) : 'x'); }
    res.writeHead(200, h); res.end('{}');
  });
});

const [SP, MP] = [await listen(stat), await listen(mock)];
const prof = mkdtempSync(join(tmpdir(), 'rw-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = () => { try { chrome.kill(); } catch {} stat.close(); mock.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
const wsUrl = await new Promise((res, rej) => { let buf = ''; const t = setTimeout(() => rej(new Error('chrome did not start')), 20000);
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } }); });
const port = new URL(wsUrl).port;
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*workers.dev*'] });   // the real workers are never reached; an attempt is still recorded below
const attempts = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Network.requestWillBeSent' && /workers\.dev/.test(m.params.request.url)) attempts.push(m.params.request.url); });

const until = async (cond, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await ev(cond)) return true; await wait(100); } return false; };
const boot = async (eng, extra = '') => {
  await send('Page.navigate', { url: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:${MP}&llm=http://127.0.0.1:${MP}&engine=${eng}${extra}` });
  const ok = await until(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e=>/programmes\\.json/.test(e.name)&&e.responseEnd>0)`, 20000);
  await wait(1700);   // the first /live-kb refresh settles (QA G12 holds early questions up to 1.5 s)
  return ok;
};
const bots = () => ev(`document.querySelectorAll('#chat .msg.b:not(.pending)').length`);
const ask = async (q, ms = 8000) => { const n = await bots();
  await ev(`(()=>{document.getElementById('q').value=${JSON.stringify(q)};document.getElementById('send').click();})()`);
  await until(`document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${n}`, ms); await wait(150);
  return ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); return b ? b.innerText.replace(/\\s+/g,' ') : ''})()`); };

for (const eng of ['rust', 'js']) {   // 'rust': Rust helpers (default); 'js': the JS helper twins. Routes are Rust in both (?route=js removed, plan 015 step 4a)
  errors.length = 0; MOCK.rewrite = { delay: 0, body: { queries: [], source: 'gemini' } }; MOCK.llm = { status: 500 };
  check(`[${eng}] the page boots and enables the input`, await boot(eng));
  await ev('sessionStorage.clear()');
  check(`[${eng}] the engine asked for is the engine running`, await ev('document.documentElement.dataset.engine') === eng.split('&')[0]);

  const a1 = await ask('ส่งรูปเล่มภายในกี่วัน');
  check(`[${eng}] a manual question is answered from the manual`, /21 วัน/.test(a1) && /ข้อมูลทางการ/.test(a1), a1);

  const card = await ask('จิตวิทยาคลินิก');
  check(`[${eng}] a programme name opens its card`, /จิตวิทยาคลินิก/.test(card) && /สถานะบนเว็บบัณฑิตวิทยาลัย/.test(card), card);
  const fu = await ask('แล้วค่าเทอมล่ะ');
  check(`[${eng}] 'แล้วค่าเทอมล่ะ' after a card answers THAT programme's fees (not the generic fee finder)`, /ตีความว่าถามเรื่องค่าธรรมเนียมของ/.test(fu) && /จิตวิทยาคลินิก/.test(fu), fu);

  const it = await ask('เข้าระบบไม่ได้');
  check(`[${eng}] a login problem gets the Graduate School IT first (LINE), the university IT desk after it`, /ติดต่องานเทคโนโลยีสารสนเทศ บัณฑิตวิทยาลัยได้โดยตรง/.test(it) && /@322wjrbo/.test(it) && /บัญชีมหาวิทยาลัยถูกล็อก: โทรกองไอที 02-849-6022/.test(it) && it.indexOf('@322wjrbo') < it.indexOf('02-849-6022'), it);

  MOCK.gaps = []; const stk = await ask('ติดปัญหา');
  check(`[${eng}] 'ติดปัญหา' asks which area (area chips + staff contact), not 'not understood', no gap`, /ติดปัญหาเรื่องไหน/.test(stk) && /วิทยานิพนธ์ \/ ส่งเล่ม/.test(stk) && /ติดต่อบัณฑิตวิทยาลัย/.test(stk) && !/จับใจความ/.test(stk) && await ev(`!![...document.querySelectorAll('#chat .msg.b')].pop().querySelector('a[href="https://line.me/R/ti/p/@gradmu"]')`) && (await wait(300), MOCK.gaps.length === 0), `${stk} gaps=${MOCK.gaps.length}`);
  const stkT = await ask('ติดปัญหาวิทยานิพนธ์');
  check(`[${eng}] 'ติดปัญหาวิทยานิพนธ์' opens the thesis entries`, /วิทยานิพนธ์และการส่งเล่มในคู่มือมีหัวข้อ/.test(stkT) && /Turnitin/.test(stkT), stkT);

  const lv = await ask('ป.โท');
  check(`[${eng}] a level-only question opens the finder at that level`, /พบ \d+ หลักสูตร/.test(lv) && /ปริญญาโท/.test(lv), lv);

  MOCK.gaps = []; const g0 = await ask('ok');
  check(`[${eng}] a non-question gets a prompt and is not logged as a gap`, /พิมพ์สิ่งที่อยากรู้ได้เลย/.test(g0) && (await wait(300), MOCK.gaps.length === 0), `${g0} gaps=${MOCK.gaps.length}`);

  const adv = await ask('อยากลาพักการศึกษา ควรทำยังไง', 25000);
  await until(`!document.querySelector('#chat .msg.b:last-child .hyb-wait')`, 25000);
  const badge = await ev(`([...document.querySelectorAll('#chat .msg.b')].pop().querySelector('.src-badge')||{}).textContent||''`);
  check(`[${eng}] advice with the AI down keeps the manual text under the official badge (not 'AI')`, /ข้อมูลทางการ/.test(badge) && !/AI/.test(badge), `${badge} | ${adv.slice(0, 80)}`);

  // a slow AI reading for an older question must not land under a newer one (QA F60)
  MOCK.rewrite = { delay: 2500, body: { queries: ['ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน'], source: 'gemini' } };
  await ev(`(()=>{document.getElementById('q').value='พรุ่งนี้ฝนจะตกไหม';document.getElementById('send').click();})()`); await wait(400);
  await ask('Turnitin เกิน 25% ทำอย่างไร'); await wait(3200);
  const last = await ev(`(()=>{const m=[...document.querySelectorAll('#chat .msg')]; const i=m.findLastIndex(x=>x.classList.contains('u') && /Turnitin เกิน 25%/.test(x.innerText)); return {after:m.slice(i+1).map(x=>x.className.replace('msg ','')), pending:document.querySelectorAll('#chat .msg.pending').length}})()`);
  check(`[${eng}] a late AI reading for an older question is dropped (nothing after the newer answer)`, last.pending === 0 && last.after.length === 1 && last.after[0].startsWith('b'), JSON.stringify(last));
  MOCK.rewrite = { delay: 0, body: { queries: [], source: 'gemini' } };

  // ---- the 5-minute pitch rehearsal (docs/pitching/10-pitch-script-5min.md): same questions, same expectations ----------------------
  const p1 = await ask('อยากสมัครเรียนชีวสารสนเทศทางการแพทย์');
  check(`[${eng}] pitch 1: the demo programme shows an OPEN card (not "closed")`, /ชีวสารสนเทศทางการแพทย์/.test(p1) && /🟢 สถานะบนเว็บบัณฑิตวิทยาลัย: กำลังเปิดรับสมัคร/.test(p1) && !/ปิดรับสมัครแล้ว/.test(p1), p1);
  const p2 = await ask('แล้วค่าเทอมล่ะ');
  check(`[${eng}] pitch 2: "แล้วค่าเทอมล่ะ" shows real fee amounts for that programme`, /ตีความว่าถามเรื่องค่าธรรมเนียมของ/.test(p2) && /ชีวสารสนเทศ/.test(p2) && /\d{1,3},\d{3}/.test(p2) && !/ยังไม่ระบุอัตรา/.test(p2), p2);
  await ask('ส่งรูปเล่มภายในกี่วัน');
  const evTxt = await ev(`(document.querySelector('#ev-list .ev-card')||{textContent:''}).textContent.replace(/\\s+/g,' ')`);
  check(`[${eng}] pitch 2b: the evidence panel shows score, entry and BLAKE3 (question + route)`, /คะแนน \d/.test(evTxt) && /คู่มือ #thesis_submit_days/.test(evTxt) && /รหัส BLAKE3 ของคำถาม\+เส้นทาง/.test(evTxt), evTxt.slice(0, 200));

  const nf = await ask('ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน');
  check(`[${eng}] pitch 3a: a question the manual lacks gets "not in the manual" and the staff contact, no invented answer`, /ยังไม่มีในคู่มือ|ยังจับใจความ|ยังหาคำตอบที่ตรง/.test(nf) && /ติดต่อ/.test(nf) && !/เจ้าหน้าที่ตอบ/.test(nf), nf);
  MOCK.live = [{ id: 901, title: 'ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน', question: 'ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน', answer: '(ตัวอย่างทดสอบ ไม่ใช่ข้อมูลจริง) ที่จอดรถอยู่ด้านหลังอาคาร A', approved_at: Date.now() }];
  await ev(`document.dispatchEvent(new Event('visibilitychange'))`); await wait(900);   // what the page does when the tab gets focus; it also polls every 15 s
  const again = await ask('ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน');
  const staffBadge = await ev(`(([...document.querySelectorAll('#chat .msg.b')].pop().querySelector('.src-badge'))||{}).textContent||''`);
  check(`[${eng}] pitch 3b: after staff approval the same question is answered, labelled "เจ้าหน้าที่ตอบ"`, /ที่จอดรถอยู่ด้านหลังอาคาร A/.test(again) && /เจ้าหน้าที่ตอบ/.test(staffBadge), `${staffBadge} | ${again}`);
  MOCK.live = []; await ev(`document.dispatchEvent(new Event('visibilitychange'))`); await wait(900);
  const gone = await ask('ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน');
  check(`[${eng}] pitch 3c: after staff retract the answer is gone again`, !/ด้านหลังอาคาร A/.test(gone) && /ยังไม่มีในคู่มือ|ยังจับใจความ|ยังหาคำตอบที่ตรง/.test(gone), gone);

  // ---- personal questions without a sign-in: an honest boundary, a way to look it up, nothing logged ----------------------------------
  MOCK.gaps = [];
  const ps = await ask('ผลสอบของฉันออกหรือยัง');
  const psLinks = await ev(`[...[...document.querySelectorAll('#chat .msg.b')].pop().querySelectorAll('.staffbox a')].map(a=>a.textContent.trim()).join('|')`);
  check(`[${eng}] personal: "my exam result" -> cannot see personal data, says why, offers the staff contact`, /ดูให้ไม่ได้/.test(ps) && /ไม่ได้เชื่อมกับระบบ/.test(ps) && /ติดต่อบัณฑิตวิทยาลัย/.test(psLinks), `${ps.slice(0, 120)} | ${psLinks}`);
  const po = await ask('ขอดูข้อมูลของเพื่อนผมหน่อย รหัส 6537001');
  check(`[${eng}] personal: a friend's record -> refused, "ask the owner", no general topic offered`, /ผมแสดงให้ไม่ได้/.test(po) && /เจ้าของข้อมูลมาถามเอง/.test(po) && !/ถามได้เลยครับ เช่น/.test(po), po.slice(0, 160));
  const pg = await ask('ผมสอบผ่านแล้วต้องทำอะไรต่อ');
  check(`[${eng}] personal: a general question with a pronoun still gets its normal answer`, !/ดูให้ไม่ได้/.test(pg) && !/ผมแสดงให้ไม่ได้/.test(pg), pg.slice(0, 120));
  await wait(400);
  check(`[${eng}] personal: neither personal question was logged as a gap`, MOCK.gaps.every(g => !/6537001|ผลสอบของฉัน/.test(g)), JSON.stringify(MOCK.gaps).slice(0, 160));

  // the conversation survives a reload in this tab; the clear button wipes it
  const before = await ev(`document.querySelectorAll('#chat .msg:not(.greet)').length`);
  await boot(eng);
  const restored = await ev(`document.querySelectorAll('#chat .msg[data-restored]').length`);
  check(`[${eng}] a reload keeps the conversation in this tab (the newest 30 messages: the stored history is capped)`, restored === Math.min(before, 30) && restored > 0, `before=${before} restored=${restored}`);
  await ev(`document.getElementById('clear-chat').click()`); await wait(500); await boot(eng);
  check(`[${eng}] the clear button wipes it (also after a reload)`, await ev(`document.querySelectorAll('#chat .msg:not(.greet)').length`) === 0);

  check(`[${eng}] no uncaught page errors`, errors.length === 0, errors.join(' | '));
}

// ---- PREVIEW builds: no production backend by default (the safe place to develop while the demo build stays untouched) ----------------
{ const go = async url => { attempts.length = 0; await send('Page.navigate', { url }); await until(`!!document.getElementById('q') && !document.getElementById('q').disabled`, 20000); await wait(2500); return [...attempts]; };
  const prod = await go(`http://127.0.0.1:${SP}/chatbot.html?engine=js`);
  check('production page (no preview stamp): still reaches for the production workers by default', prod.length > 0 && !(await ev(`!!document.getElementById('preview-banner')`)), prod.join(' '));
  const prev = await go(`http://127.0.0.1:${SP}/chatbot.preview.html?engine=js`);
  const banner = await ev(`!!document.getElementById('preview-banner')`);
  const a = await ask('ส่งรูปเล่มภายในกี่วัน'); const nf = await ask('ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน'); await wait(700);
  check('preview page: shows the preview banner, makes NO request to the production workers (not even after a not-found question)', banner && prev.length === 0 && attempts.length === 0, `${prev.join(' ')} | after asking: ${attempts.join(' ')}`);
  check('preview page: answers from the manual exactly as production does (search is local)', /21 วัน/.test(a) && /ยังไม่มีในคู่มือ|ยังจับใจความ|ยังหาคำตอบที่ตรง/.test(nf), a);
  const r0 = MOCK_REQS; await go(`http://127.0.0.1:${SP}/chatbot.preview.html?engine=js&api=http://127.0.0.1:${MP}&llm=http://127.0.0.1:${MP}`);
  check('preview page: ?api= / ?llm= still connect it on purpose (a staging worker or a mock)', MOCK_REQS > r0 && attempts.length === 0, `mock requests +${MOCK_REQS - r0}`);
  await go(`http://127.0.0.1:${SP}/dashboard.preview.html`);
  check('preview dashboard: the kernel base starts empty (approve / retract cannot touch production)', await ev(`document.getElementById('base').value === ''`) && attempts.length === 0, attempts.join(' '));
  await go(`http://127.0.0.1:${SP}/chatbot.stale.html`);
  const stale = await ask('ส่งรูปเล่มภายในกี่วัน');
  check('stale wasm (no WASM.Router): the page asks for a reload instead of guessing a route', /โหลดหน้าใหม่/.test(stale) && !/21 วัน/.test(stale), stale);
  await go(`http://127.0.0.1:${SP}/dashboard.html`);
  check('production dashboard: base unchanged (points at the production kernel)', /workers\.dev/.test(await ev(`document.getElementById('base').value`))); }

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
cleanup(); process.exit(fail ? 1 : 0);
