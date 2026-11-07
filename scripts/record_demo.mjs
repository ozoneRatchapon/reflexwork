#!/usr/bin/env node
// Record a backup demo video (what the audience would see if the venue network or the site fails).
// Drives headless Chrome over CDP: types each question character by character, shows a visible cursor that moves to what it clicks
// (with a ripple), and records with Page.startScreencast; ffmpeg turns the timed frames into a 1920x1080 mp4.
//   node scripts/record_demo.mjs <scenario.json> <out.mp4> [--url=<chat url>] [--mock]
//   --mock: start scripts/demo_mock_server.mjs (local page + in-memory kernel) and use it - NOTHING is written to production.
//           --ref=<git ref> (or "ref" in the scenario) serves the pages as committed at that ref instead of the working tree.
//           In the scenario, {MOCK_PAGE} and {MOCK_API} are replaced by the local page origin and the mock kernel origin.
// scenario.json: { "url": "...", "hold": 3500, "steps": [ ... ] }  steps run in the CHAT tab unless a "tab" step switched:
//   {"ask": "text"}             type into the chat box, send, wait for the answer
//   {"click": "text"}           click the first chip/link in the LAST bot message whose text contains it, wait for the answer
//   {"open": "dashboard", "url": "...", "eval": "js run after load"}   open a second tab (not shown until switched to)
//   {"tab": "chat"|"<name>"}    switch the recording to that tab (the chat tab refreshes staff answers, as a real tab switch does)
//   {"click_sel": "css", "text": "optional substring"}   click an element in the current tab
//   {"type_sel": "css", "text": "..."}                   type into a field in the current tab
//   {"wait_text": "..."}        wait until the current tab shows this text
//   {"pause": ms}               hold the frame
// Every step may carry "hold" (ms to hold after it). Fails loudly when a step does not work, so a broken video is never written.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [scenarioPath, outPath] = args.filter(a => !a.startsWith('--'));
if (!scenarioPath || !outPath) { console.error('usage: node scripts/record_demo.mjs <scenario.json> <out.mp4> [--url=...] [--mock]'); process.exit(2); }
let raw = readFileSync(scenarioPath, 'utf8');
let mock = null;
// "ref" in the scenario (or --ref=): with --mock, serve the pages as committed at that git ref, i.e. what production runs
const scenario_ref = text => { try { return JSON.parse(text).ref || ''; } catch { return ''; } };
if (opt.mock) {
  const { start_demo_servers } = await import(join(dirname(fileURLToPath(import.meta.url)), 'demo_mock_server.mjs'));
  mock = await start_demo_servers(Number(opt.port || 18790), opt.ref || scenario_ref(raw));   // high port: 87xx is often taken by `wrangler dev` (workerd)
  raw = raw.replaceAll('{MOCK_PAGE}', `http://127.0.0.1:${mock.port}`).replaceAll('{MOCK_API}', `http://127.0.0.1:${mock.port + 1}`);
} else if (/\{MOCK_/.test(raw)) { console.error('this scenario needs --mock'); process.exit(2); }
const scenario = JSON.parse(raw);
const URL_ = opt.url || scenario.url || 'https://reflexwork.pages.dev/chatbot?view=judge';
const HOLD = Number(scenario.hold || 3500), TYPE_MS = Number(scenario.type_ms || 110);
const W = 1280, H = 720, DSF = 1.5;   // 1920x1080 frames: sharp on a projector
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
if (!CHROME) { console.error('no Chrome found (set CHROME_PATH)'); process.exit(2); }
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg not found'); process.exit(2); }

const wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-rec-')), frames = mkdtempSync(join(tmpdir(), 'rw-frames-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
// Chrome may still be flushing its profile when we exit: cleanup is best-effort (a leftover temp dir is harmless)
const cleanup = () => { try { chrome.kill(); } catch {} try { mock?.stat.close(); mock?.kernel.close(); } catch {}
  for (const d of [prof, frames]) { try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch {} } };
process.on('exit', cleanup);
const fail = msg => { console.error('✗ ' + msg); process.exit(1); };

const wsUrl = await new Promise((res, rej) => { let b = ''; const t = setTimeout(() => rej(new Error('chrome did not start')), 20000);
  chrome.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } }); });
const DEVTOOLS = `http://127.0.0.1:${new URL(wsUrl).port}`;
const shots = [];

// one CDP connection per tab
async function open_tab(url, block_prod) {
  const t = await (await fetch(`${DEVTOOLS}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === 'Page.screencastFrame') {
      const f = join(frames, `f${String(shots.length).padStart(6, '0')}.jpg`);
      writeFileSync(f, Buffer.from(m.params.data, 'base64')); shots.push({ f, t: m.params.metadata.timestamp });
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    } });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  if (block_prod) await send('Network.setBlockedURLs', { urls: ['*workers.dev*'] });   // --mock: the production workers are never reached
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  // answer confirm()/alert() dialogs (the dashboard's "retract?" confirm) so a step never hangs
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); });
  await send('Page.navigate', { url });
  return { id: t.id, send, ev };
}
const until = async (tab, c, ms = 20000) => { for (let t = 0; t < ms; t += 100) { if (await tab.ev(c)) return true; await wait(100); } return false; };
const CURSOR_JS = `(()=>{ if(document.getElementById('rec-cursor')) return true; const c=document.createElement('div'); c.id='rec-cursor';
  c.style.cssText='position:fixed;z-index:99999;left:${W - 30}px;top:${H - 30}px;width:22px;height:22px;border-radius:50%;background:rgba(255,215,64,.9);border:2px solid #222;box-shadow:0 0 0 4px rgba(255,215,64,.35);pointer-events:none;transform:translate(-50%,-50%);transition:left .7s ease,top .7s ease';
  document.body.appendChild(c);
  window.__recMove=(x,y)=>{c.style.left=x+'px';c.style.top=y+'px';};
  window.__recRipple=(x,y)=>{const r=document.createElement('div');r.style.cssText='position:fixed;z-index:99998;left:'+x+'px;top:'+y+'px;width:14px;height:14px;border-radius:50%;border:3px solid rgba(255,215,64,.95);pointer-events:none;transform:translate(-50%,-50%);transition:all .5s ease-out;opacity:1';document.body.appendChild(r);requestAnimationFrame(()=>{r.style.width='64px';r.style.height='64px';r.style.opacity='0';});setTimeout(()=>r.remove(),600);};
  return true; })()`;

const tabs = {};
tabs.chat = await open_tab(URL_, !!mock);
if (!await until(tabs.chat, `!!document.getElementById('q') && !document.getElementById('q').disabled`, 30000)) fail('the chat did not boot: ' + URL_);
await wait(2000);   // first /live-kb refresh settles
await tabs.chat.ev(CURSOR_JS);
let cur = tabs.chat, cur_name = 'chat';
const record = async tab => { await tab.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 }); };

const moveTo = async (tab, sel) => {
  const ok = await tab.ev(`(()=>{const el=${sel}; if(!el) return null; el.scrollIntoView({block:'center',behavior:'smooth'}); return true;})()`);
  if (!ok) return null; await wait(650);
  const r = await tab.ev(`(()=>{const b=(${sel}).getBoundingClientRect(); const x=b.left+Math.min(b.width/2,120), y=b.top+b.height/2; __recMove(x,y); return {x,y};})()`);
  await wait(800); return r; };
const park = tab => tab.ev(`__recMove(${W - 30},${H - 30})`);
const bots = () => tabs.chat.ev(`document.querySelectorAll('#chat .msg.b:not(.pending)').length`);
const waitAnswer = async n => until(tabs.chat, `document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${n}`, 25000);
const typeInto = async (tab, text) => { for (const ch of [...text]) { await tab.send('Input.insertText', { text: ch }); await wait(TYPE_MS); } };
const sel_of = (css, text) => text ? `[...document.querySelectorAll(${JSON.stringify(css)})].find(x=>x.innerText.includes(${JSON.stringify(text)}) || (x.value||'').includes(${JSON.stringify(text)}))` : `document.querySelector(${JSON.stringify(css)})`;

await record(cur); await wait(1500);
let i = 0;
for (const s of scenario.steps) {
  i++;
  const hold = Number(s.hold ?? HOLD);
  if (s.pause) { await wait(s.pause); continue; }
  if (s.open) {
    tabs[s.open] = await open_tab(s.url, !!mock);
    if (!await until(tabs[s.open], `document.readyState==='complete'`, 30000)) fail(`step ${i}: ${s.open} did not load`);
    await tabs[s.open].ev(CURSOR_JS);
    if (s.eval) await tabs[s.open].ev(s.eval);
    await wait(1200); console.log(`✓ step ${i}: open ${s.open}`); continue;
  }
  if (s.tab) {
    const next = tabs[s.tab]; if (!next) fail(`step ${i}: no tab ${s.tab}`);
    await cur.send('Page.stopScreencast');
    await fetch(`${DEVTOOLS}/json/activate/${next.id}`);
    await next.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });   // activation can reset it (letterboxed frames)
    if (s.tab === 'chat') await next.ev(`document.dispatchEvent(new Event('visibilitychange'))`);   // a real tab switch refreshes staff answers
    cur = next; cur_name = s.tab; await record(cur); await wait(hold); console.log(`✓ step ${i}: tab ${s.tab}`); continue;
  }
  if (s.wait_text) { if (!await until(cur, `document.body.innerText.includes(${JSON.stringify(s.wait_text)})`, 25000)) fail(`step ${i}: "${s.wait_text}" never appeared in ${cur_name}`); await wait(hold); console.log(`✓ step ${i}: saw "${s.wait_text}"`); continue; }
  if (s.click_sel) {
    const sel = sel_of(s.click_sel, s.text); const p = await moveTo(cur, sel); if (!p) fail(`step ${i}: nothing matches ${s.click_sel} ${s.text || ''}`);
    await cur.ev(`__recRipple(${p.x},${p.y})`); await wait(250); await cur.ev(`(${sel}).click()`); await wait(400); await park(cur);
    await wait(hold); console.log(`✓ step ${i}: click ${s.click_sel} ${s.text || ''}`); continue;
  }
  if (s.type_sel) {
    const sel = sel_of(s.type_sel); const p = await moveTo(cur, sel); if (!p) fail(`step ${i}: no field ${s.type_sel}`);
    await cur.ev(`(()=>{const f=${sel}; f.focus(); f.value=''; return true;})()`); await park(cur);
    await typeInto(cur, s.text); await wait(hold); console.log(`✓ step ${i}: typed into ${s.type_sel}`); continue;
  }
  if (cur_name !== 'chat') fail(`step ${i}: ask/click run in the chat tab (switch with {"tab":"chat"})`);
  const n = await bots();
  if (s.ask) {
    await moveTo(cur, `document.getElementById('q')`);
    await cur.ev(`(()=>{const q=document.getElementById('q'); q.focus(); q.value=''; return true;})()`);
    await typeInto(cur, s.ask); await wait(500);
    const p = await moveTo(cur, `document.getElementById('send')`); if (p) await cur.ev(`__recRipple(${p.x},${p.y})`);
    await cur.ev(`document.getElementById('send').click()`);
  } else if (s.click) {
    const sel = `[...([...document.querySelectorAll('#chat .msg.b')].pop()||document).querySelectorAll('button,a,[onclick],[role=button]')].find(x=>x.innerText.includes(${JSON.stringify(s.click)}))`;
    const p = await moveTo(cur, sel); if (!p) fail(`step ${i}: no chip containing "${s.click}" in the last answer`);
    await cur.ev(`__recRipple(${p.x},${p.y})`); await wait(250); await cur.ev(`(${sel}).click()`);
  } else fail(`step ${i}: unknown step ${JSON.stringify(s)}`);
  await wait(400); await park(cur);
  if (!await waitAnswer(n)) fail(`step ${i}: no answer appeared for ${JSON.stringify(s)}`);
  if (s.expect) { const last = await cur.ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); return b ? b.innerText : ''})()`);
    if (!new RegExp(s.expect).test(last)) fail(`step ${i}: the answer does not match /${s.expect}/: ${last.replace(/\s+/g, ' ').slice(0, 200)}`); }
  await wait(600);   // show the top of the new answer (the chat may have scrolled to its bottom)
  await cur.ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); b && b.scrollIntoView({block:'start',behavior:'smooth'}); return true;})()`);
  await wait(hold);
  console.log(`✓ step ${i}: ${JSON.stringify(s.ask ? { ask: s.ask } : { click: s.click })}`);
}
await wait(1000);
await cur.send('Page.stopScreencast'); await wait(300);
if (shots.length < 2) fail('no frames recorded');

// timed frames -> constant 30 fps mp4 (each frame shown until the next one arrived; a gap at a tab switch is capped at 0.5 s)
const list = shots.map((s, k) => `file '${s.f}'\nduration ${Math.min(Math.max(0.001, (shots[k + 1]?.t ?? s.t + 1) - s.t), k + 1 < shots.length ? 30 : 1).toFixed(3)}`).join('\n') + `\nfile '${shots.at(-1).f}'\n`;
writeFileSync(join(frames, 'list.txt'), list);
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
  '-vf', `scale=${W * DSF}:${H * DSF}:force_original_aspect_ratio=decrease,pad=${W * DSF}:${H * DSF}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', resolve(outPath)], { stdio: 'inherit' });
if (ff.status !== 0) fail('ffmpeg failed');
console.log(`wrote ${resolve(outPath)} · ${shots.length} frames · ${(shots.at(-1).t - shots[0].t).toFixed(1)}s · from ${mock ? 'LOCAL mock backend (nothing written to production)' : URL_}`);
process.exit(0);
