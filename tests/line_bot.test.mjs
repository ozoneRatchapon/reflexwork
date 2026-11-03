// LINE bot (integrations/line-worker): (1) its KB copy is the same approved index the web serves, (2) students see plain
// source labels, not the engineering trail (unless LINE_VIEW=judge). Offline: a signed webhook, LINE/kernel APIs mocked.
// Run: node tests/line_bot.test.mjs
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
if (existsSync(join(root, 'submissions/ui/knowledge-index.json'))) {
  const r = spawnSync(process.execPath, [join(root, 'scripts/gen_line_kb.mjs'), '--check'], { encoding: 'utf8' });
  check('LINE KB copy matches the web index (run node scripts/gen_line_kb.mjs after rebuilding the index)', r.status === 0, r.stdout.trim());
} else console.log('- skipped KB sync check: build the index first (python3 submissions/build_knowledge_index.py)');
const { default: w } = await import('../integrations/line-worker/worker.mjs');
const keep = setInterval(() => {}, 50);
async function say(text, env = {}) {
  const sent = []; const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).includes('api.line.me')) sent.push(JSON.parse(init.body)); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); };
  const raw = JSON.stringify({ events: [{ type: 'message', replyToken: 't', source: { userId: 'u' }, message: { type: 'text', text } }] });
  const sig = createHmac('sha256', 'sec').update(raw).digest('base64'); let p;
  await w.fetch(new Request('https://x/webhook', { method: 'POST', headers: { 'x-line-signature': sig }, body: raw }), { LINE_CHANNEL_SECRET: 'sec', LINE_CHANNEL_ACCESS_TOKEN: 'tok', ...env }, { waitUntil: x => { p = x; } });
  await p; globalThis.fetch = real; return sent.map(m => m.messages.map(x => x.text).join('\n')).join('\n');
}
const kb = await say('ลาพักการศึกษาต้องทำอย่างไร');
check('a KB answer ends with a plain source label', /✅ ข้อมูลทางการจากคู่มือ$/.test(kb), kb.slice(-80));
check('students do not see route / token / rethink / fingerprint words (🦀 is the mascot in the greeting, allowed)', !/🦀 FastPath|🔒|FastPath|token|rethink|LLM path/i.test(kb + await say('สวัสดี')) && !/🦀/.test(kb), kb.slice(-120));
check('the answer reads as points, answer first', kb.startsWith('ยื่นแบบฟอร์ม RA-04') && /\n• /.test(kb));
const judge = await say('ลาพักการศึกษาต้องทำอย่างไร', { LINE_VIEW: 'judge' });
check('LINE_VIEW=judge keeps the engineering footer for the panel', /🦀 FastPath · ตอบจากคู่มือ · 0 token/.test(judge), judge.slice(-120));
const nw = await say('รถรับส่งไปศาลายามีตารางไหม');
check('an entry that only exists in the synced index is answered (gm_travel_navigation; the old copy said "ค่าปรับส่งเล่ม")', /Shuttle Bus/.test(nw), nw.slice(0, 120));
clearInterval(keep);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
