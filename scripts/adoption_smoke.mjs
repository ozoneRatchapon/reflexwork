#!/usr/bin/env node
// Proves an adopted site is really "someone else's": serves a folder built by scripts/new_agency.mjs, drives it in headless Chrome and checks
//   - the organisation's own words and answers show, nothing of the Graduate School shows (text, links, requests),
//   - its example questions are answered from ITS knowledge base, an off-topic or foreign question is declined with ITS contact button,
//   - no script errors.   node scripts/adoption_smoke.mjs <site-dir>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
const dir = resolve(process.argv[2] || ''); if (!existsSync(join(dir, 'agency.json'))) { console.error('usage: node scripts/adoption_smoke.mjs <site-dir built by new_agency.mjs>'); process.exit(64); }
const agency = JSON.parse(readFileSync(join(dir, 'agency.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(dir, p);
  if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('no'); return; } res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const SP = server.address().port;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', PORT = 9481, wait = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'rw-adopt-')); const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} try { server.close(); } catch {} }; process.on('exit', cleanup);
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await wait(250); } }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [], hosts = new Set();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Network.requestWillBeSent') { try { hosts.add(new URL(m.params.request.url).host); } catch {} } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
let hard = 0; const ok = (n, x = '') => console.log(`✓ ${n}${x ? '  ' + x : ''}`), bad = (n, x = '') => { hard++; console.log(`✗ ${n}${x ? '  ' + x : ''}`); };
await send('Runtime.enable'); await send('Network.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
// NO ?api= / ?ai=off here on purpose: the DEFAULTS of an adopted site must not reach any server of ours
await send('Page.navigate', { url: `http://127.0.0.1:${SP}/?view=judge` }); await wait(1500);
for (let i = 0; i < 40 && await ev(`!document.getElementById('q') || document.getElementById('q').disabled`); i++) await wait(250);
const GS = /บัณฑิตวิทยาลัย|วิทยานิพนธ์|Turnitin|MU GRAD|graduate\.mahidol|mahidol/i;
const ask = async q => { await ev(`(()=>{const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click();})()`); await wait(1500);
  return ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')], l=b[b.length-1]; return { text:l.innerText.replace(/\\s+/g,' '), topic:((l.querySelector('.topic')||{}).textContent||'').replace(/^(?:ที่มา|หัวข้อ|อ้างอิง):\\s*/,'').trim(), links:[...l.querySelectorAll('a')].map(a=>a.href), declined:/จับใจความคำถามนี้ไม่ได้|I couldn't find this/.test(l.innerText) }; })()`); };
// 1) the page speaks for the organisation
const vis = await ev(`document.body.innerText`); const links0 = await ev(`[...document.querySelectorAll('a')].map(a=>a.href)`);
(await ev(`document.title`)) === agency.metaTitle ? ok('title is the organisation\'s', agency.metaTitle) : bad('title', await ev(`document.title`));
vis.includes(agency.title) && vis.includes(agency.greeting) ? ok('hero title and greeting come from agency.json') : bad('hero/greeting not applied');
!GS.test(vis) ? ok('no word of the Graduate School anywhere on the page') : bad('Graduate School words still visible', (vis.match(GS) || [])[0] + ' … ' + vis.split('\n').find(l => GS.test(l)));
!links0.some(h => GS.test(h)) ? ok('no link to the Graduate School before any question') : bad('Graduate School link on the page', links0.find(h => GS.test(h)));
// 2) its own example questions are answered from its own knowledge base
let answered = 0; const asked = agency.examples || [];
for (const ex of asked) { const r = await ask(ex.q); if (r.topic) answered++; else console.log('   not answered from an entry:', ex.q, '->', r.text.slice(0, 80)); if (r.links.some(h => GS.test(h))) bad('a Graduate School link in an answer', ex.q); }
asked.length && answered === asked.length ? ok(`all ${asked.length} example questions are answered from the organisation's own entries`) : bad('example questions', `${answered}/${asked.length}`);
// an advice-style question would go to the AI proxy on our own site; on an adopted site there is no proxy unless agency.json names one
{ const r = await ask('ช่วยแนะนำวิธีจองห้องประชุมกลุ่มหน่อย'); r.topic || r.text.length > 20 ? ok('an advice-style question is answered without an AI proxy', r.topic ? 'from ' + r.topic : r.text.slice(0, 50)) : bad('advice question', r.text.slice(0, 80)); }
// 3) off-topic and foreign questions are declined, with THIS organisation's contact button and nothing of ours
for (const q of ['เมืองหลวงของฝรั่งเศสคืออะไร', 'ส่ง Turnitin เกิน 25% ทำยังไง', 'what is the tuition fee for the master programme?']) {
  const r = await ask(q);
  !r.topic && r.declined ? ok(`declines: "${q}"`) : bad(`should decline: "${q}"`, `${r.topic ? 'answered from ' + r.topic : r.text.slice(0, 80)}`);
  if (r.links.some(h => GS.test(h))) bad('a Graduate School link in a decline', q);
  if (agency.contact && agency.contact.url && !r.links.includes(agency.contact.url)) bad('the decline lacks the organisation\'s contact button', q); }
agency.contact ? ok('declines carry the organisation\'s contact button') : ok('no contact configured: declines show no staff button (as configured)');
const all = [...hosts].filter(h => !/^127\.0\.0\.1/.test(h)); !all.length ? ok('no network request leaves the site: no kernel, no AI proxy, no Graduate School (defaults)') : bad('the adopted site called an external host by default', all.join(', '));
errs.length ? bad('script errors', errs.slice(0, 2).join(' | ')) : ok('no script errors');
console.log(`\n${hard ? '✗ ' + hard + ' failure(s)' : '✓ the adopted site is self-contained'}`); cleanup(); process.exit(hard ? 1 : 0);
