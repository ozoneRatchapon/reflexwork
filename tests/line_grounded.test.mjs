// LINE advice answers go through the proxy's grounded path and its guard (QA F12): the question and the manual excerpt are sent
// separately (the whole prompt as `input` was cut at 2000 chars and never guarded), and the guard's fallback is no answer.
// The proxy guard itself checks whole numbers, Thai digits, number+unit pairs and month names (QA F32).
// Run: node tests/line_grounded.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { askTeam } from '../integrations/_shared/team-adapter.mjs';
import { groundedContext, groundedPrompt } from '../integrations/_shared/intake.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const kb = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')).slice(0, 3);
const q = 'อยากลาพักการศึกษา ควรทำยังไง', context = groundedContext(kb), prompt = groundedPrompt(q, kb);
let sent = null, reply = { answer: 'ok', source: 'gemini' };
globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => reply }; };

const r1 = await askTeam(q, { TEAM_API_PROVIDER: 'gemini' }, { context, prompt });
check('F12: our proxy gets the bare question + the manual as context', r1.ok && sent.input === q && sent.context === context, JSON.stringify(sent).slice(0, 160));
check('F12: the prompt builder and the context share one excerpt', prompt.endsWith(context));
await askTeam(q, { TEAM_API_PROVIDER: 'ollama', TEAM_API_URL: 'http://x' }, { context, prompt });
check('F12: a provider without a context field still gets the self-contained grounded prompt', sent.messages?.[1]?.content === prompt);
await askTeam(q, { TEAM_API_PROVIDER: 'gemini' });
check('an ungrounded call is unchanged ({input} only)', sent.input === q && !('context' in sent));
reply = { answer: '', source: 'fallback', detail: ['guard-emptied'] };
const r2 = await askTeam(q, { TEAM_API_PROVIDER: 'gemini' }, { context, prompt });
check('F12: a proxy fallback (e.g. guard emptied the answer) is not an answer - LINE shows the manual text', !r2.ok && r2.text === null);
const line = readFileSync(join(root, 'integrations/line-worker/worker.mjs'), 'utf8');
check('F12: the LINE advice branch passes the context', /askTeam\(text, bag, \{ context: groundedContext\(near\), prompt: groundedPrompt\(text, near\) \}\)/.test(line));

// F32: the proxy guard (both copies)
const ctx = 'ยื่นคำร้องภายใน 15 วัน ค่าธรรมเนียม 4,000 บาท ติดต่อ 02-849-6000 ผลคะแนน 3.00 ภายในวันที่ 30 มกราคม 2569 ช่วง 13–20 กรกฎาคม แบบฟอร์ม RA-04';
const bad = ['ยื่นภายใน 5 วัน', 'ไม่เสียค่าธรรมเนียม 0 บาท', 'ยื่นภายใน ๓๐ วัน', 'โทร 02-123-4567', 'ยื่นภายในวันที่ 15 ธันวาคม', 'ค่าเทอม 20,000', 'เกรด 3.50', '12 หน่วยกิต', '฿9,999', 'RA-0'];
const good = ['ยื่นคำร้องภายใน 15 วัน', 'ค่าธรรมเนียม 4,000 บาท', 'ค่าธรรมเนียม 4000 บาท', 'ติดต่อ 02-849-6000', 'ผลคะแนน 3.00 ภายในวันที่ 30 มกราคม 2569', 'ยื่นภายใน ๑๕ วัน', '1. ยื่นแบบฟอร์ม RA-04', '- ยื่นภายใน 15 วัน', 'ลงทะเบียนช่วง 13-20 กรกฎาคม'];
const all = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
for (const f of ['integrations/llm-proxy/worker.mjs', 'integrations/llm-proxy/local-llm-proxy.mjs']) {
  const src = readFileSync(join(root, f), 'utf8'), i = src.indexOf('function groundedGuard(');
  const g = new Function(src.slice(i, src.indexOf('\n}\n', i) + 2) + ';return groundedGuard;')();
  check(`F32 ${f}: invented numbers, dates, phones, units and months are dropped`, bad.every(b => g(b, ctx) === ''), bad.filter(b => g(b, ctx) !== '').join(' | '));
  check(`F32 ${f}: grounded facts (also Thai digits, list markers, ranges) are kept`, good.every(b => g(b, ctx) === b), good.filter(b => g(b, ctx) !== b).join(' | '));
  const lost = all.filter(e => g(e.answer, `[1] ${e.title}\n${e.answer}`).split('\n').filter(Boolean).length < String(e.answer).split(/\n+/).flatMap(l => l.split(/(?<=[.!?。])\s+/)).map(x => x.trim()).filter(Boolean).filter(p => !/^\d+[.)]?$/.test(p)).length);
  check(`F32 ${f}: every one of the ${all.length} manual answers passes its own guard untouched`, lost.length === 0, lost.map(e => e.id).slice(0, 5).join(' '));
}
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
