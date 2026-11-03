// /rewrite on the LLM proxy: turns an oddly-phrased question into search phrases. It must never return an answer, a number,
// or anything when the model says NONE, and must give up quietly (empty list) when the model is down.
// Run: node tests/llm_rewrite.test.mjs   (no network: upstream is mocked)
import worker, { parseRewrite, resetGeminiState, REWRITE_SYS } from '../integrations/llm-proxy/worker.mjs';
let pass = 0, fail = 0, n = 0;
const keepAlive = setInterval(() => {}, 50);
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const realFetch = globalThis.fetch;
const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const gem = text => () => reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
const hang = (_u, init) => new Promise((_, rej) => init && init.signal && init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))));
async function rw(env, upstream, input = 'อยากหยุดเรียนสักเทอมทำไง') {
  resetGeminiState(); let sent = '';
  globalThis.fetch = (u, init) => { if (init && init.body) sent += init.body; return upstream(u, init); };
  const t = Date.now();
  const res = await worker.fetch(new Request('https://proxy.test/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://reflexwork.pages.dev', 'CF-Connecting-IP': `10.1.0.${++n}` }, body: JSON.stringify({ input }) }), env);
  const text = await res.text(); globalThis.fetch = realFetch;
  return { ms: Date.now() - t, status: res.status, json: JSON.parse(text), sent };
}
check('parse: strips numbering, bullets and quotes; keeps at most 3', JSON.stringify(parseRewrite('1. ลาพักการศึกษา\n- "รักษาสถานภาพ"\n• ขยายเวลา\nสี่')) === JSON.stringify(['ลาพักการศึกษา', 'รักษาสถานภาพ', 'ขยายเวลา']));
check('parse: NONE gives nothing', parseRewrite('NONE').length === 0 && parseRewrite('none.').length === 0);
check('parse: drops lines with digits (facts) and long lines (answers)', parseRewrite('ยื่นภายใน 30 วัน\n' + 'ก'.repeat(61)).length === 0);
check('parse: removes duplicates', parseRewrite('ลาพัก\nลาพัก').length === 1);
check('the instruction forbids answering and facts, and defines NONE', /ห้ามตอบคำถาม/.test(REWRITE_SYS) && /NONE/.test(REWRITE_SYS));
{ const r = await rw({ GEMINI_API_KEY: 'K', GEMINI_MODEL: 'm' }, gem('ลาพักการศึกษา\nรักษาสถานภาพการเป็นนักศึกษา'));
  check('happy path returns phrases with source gemini', r.json.source === 'gemini' && r.json.queries[0] === 'ลาพักการศึกษา' && r.json.queries.length === 2, JSON.stringify(r.json));
  check('only the question is sent upstream (no KB context)', r.sent.includes('อยากหยุดเรียน') && !/ข้อมูลคู่มือ/.test(r.sent)); }
{ const r = await rw({ GEMINI_API_KEY: 'K', GEMINI_MODEL: 'm' }, gem('NONE'), 'วิธีทำต้มยำกุ้ง');
  check('off-topic: model says NONE -> empty list', r.json.queries.length === 0 && r.json.source === 'gemini', JSON.stringify(r.json)); }
{ const r = await rw({ GEMINI_API_KEY: 'K', REWRITE_BUDGET_MS: 1500 }, hang);
  check('model down: empty list within the budget', r.json.queries.length === 0 && r.json.source === 'fallback' && r.ms < 3500, `${r.ms} ms`); }
{ const r = await rw({}, gem('x'));
  check('no key configured: empty list, no error status', r.status === 200 && r.json.queries.length === 0); }
clearInterval(keepAlive);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
