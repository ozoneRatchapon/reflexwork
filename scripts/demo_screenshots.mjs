#!/usr/bin/env node
// Backup material for the pitch: runs the scripted demo on the LIVE page (dead ?api= port: nothing is written to production) and saves one PNG
// per step, 1280x800, evidence panel open. If the network or the site fails on stage, show these.
//   node scripts/demo_screenshots.mjs [--url https://reflexwork.pages.dev/chatbot] [--out /tmp/rw_prod/demo_backup]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('--url') || 'https://reflexwork.pages.dev/chatbot?view=judge', OUT = arg('--out') || '/tmp/rw_prod/demo_backup';
const URL_ = BASE + (BASE.includes('?') ? '&' : '?') + 'api=http://127.0.0.1:9';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9467, wait = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), 'rw-shot-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 80; i++) { await wait(250); if (await ev(`!!document.getElementById('q') && !document.getElementById('q').disabled && performance.getEntriesByType('resource').some(e => /programmes\\.json/.test(e.name) && e.responseEnd > 0)`)) break; }
await wait(300);
const shot = async name => { await ev(`(()=>{const c=document.getElementById('chat'); c.scrollTop=c.scrollHeight; const l=[...document.querySelectorAll('#chat .msg.b')].pop(); if(l) l.scrollIntoView({block:'start'});})()`); await wait(500);
  const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name + '.png'), Buffer.from(s.data, 'base64')); console.log('saved', name + '.png'); };
const ask = async (q, ms = 1800) => { await ev(`(()=>{const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click();})()`); await wait(ms); };
await shot('00_start');
await ask('อยากสมัครเรียนจิตวิทยาคลินิก'); await shot('01_programme_card');
await ask('แล้วค่าเทอมล่ะ'); await shot('02_fee_followup');
await ask('ทำงานอะไรดี'); await ev(`[...document.querySelectorAll('#chat .msg.b:last-child [data-fk=topic]')].find(x => /คอมพิวเตอร์/.test(x.innerText))?.click()`); await wait(600); await shot('03_career_computer');
await ask('เมืองหลวงของฝรั่งเศสคืออะไร'); await shot('04_declines_off_topic');
await ask('ช่วยแนะนำเรื่องส่ง Turnitin Originality Report', 9000); await shot('05_turnitin_ai_rephrase');
cleanup(); process.exit(0);
