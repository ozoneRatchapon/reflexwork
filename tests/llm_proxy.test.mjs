// The LLM proxy (integrations/llm-proxy/worker.mjs) must ALWAYS answer within its budget and say why a backend failed.
// Run: node tests/llm_proxy.test.mjs   (no network: upstream is mocked)
//   regression for 2026-11-03: a stalled upstream left the request hanging for > 90 s with nothing in the logs.
import worker from '../integrations/llm-proxy/worker.mjs';

let pass = 0, fail = 0, n = 0;
const keepAlive = setInterval(() => {}, 50);   // Node's AbortSignal.timeout() timers are unref'd; Workers keep a request alive, Node would exit mid-await
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const realFetch = globalThis.fetch;
const hang = (_u, init) => new Promise((_, rej) => init && init.signal && init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: init.signal.reason && init.signal.reason.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError' }))));
const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const KEY = 'SECRET-KEY-DO-NOT-LEAK-123';
async function ask(env, upstream, body = { input: 'สวัสดี', context: '[1] ทดสอบ\nเปิดทำการจันทร์-ศุกร์' }) {
  globalThis.fetch = upstream;
  const t = Date.now();
  const res = await worker.fetch(new Request('https://proxy.test/llm', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://reflexwork.pages.dev', 'CF-Connecting-IP': `10.0.0.${++n}` }, body: JSON.stringify(body) }), env);
  const text = await res.text(); globalThis.fetch = realFetch;
  return { ms: Date.now() - t, status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

// 1) Gemini never answers
{ const r = await ask({ GEMINI_API_KEY: KEY, LLM_BUDGET_MS: 2500 }, hang);
  check('a Gemini that never answers still gets an answer within the budget', r.ms < 4500 && r.json && r.json.source === 'fallback', `${r.ms} ms ${r.text.slice(0, 80)}`);
  check('...and the response says each stage timed out', r.json && r.json.detail.some(d => /timeout/.test(d)), JSON.stringify(r.json && r.json.detail)); }
// 2) local model sends headers, then stalls on the body (the case the old timer could not cover)
{ const stall = (url, init) => String(url).startsWith('http://ollama.test') ? Promise.resolve({ ok: true, status: 200, json: () => new Promise((_, rej) => init && init.signal && init.signal.addEventListener('abort', () => rej(new Error('aborted')))) }) : hang(url, init);
  const r = await ask({ OLLAMA_URL: 'http://ollama.test/api/chat', OLLAMA_TIMEOUT_MS: 600, GEMINI_API_KEY: KEY, LLM_BUDGET_MS: 2500 }, stall);
  check('a local model that stalls AFTER sending headers is cut off too', r.ms < 4500 && r.json && /ollama:timeout/.test(JSON.stringify(r.json.detail)), `${r.ms} ms ${JSON.stringify(r.json && r.json.detail)}`); }
// 3) upstream errors are reported as status codes
{ const r = await ask({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'm-x' }, () => reply(429, { error: { status: 'RESOURCE_EXHAUSTED' } }));
  check('upstream HTTP errors are reported as "<model>:<status>/<reason>"', r.json && r.json.source === 'fallback' && r.json.detail.includes('m-x:429/RESOURCE_EXHAUSTED'), JSON.stringify(r.json && r.json.detail)); }
// 4) the key never appears in anything returned
{ const r = await ask({ GEMINI_API_KEY: KEY, LLM_BUDGET_MS: 1200 }, hang); const r2 = await ask({ GEMINI_API_KEY: KEY }, () => reply(403, { error: { status: 'PERMISSION_DENIED', message: `key ${KEY} is invalid` } }));
  check('the API key is never echoed (timeout and upstream-error responses)', !r.text.includes(KEY) && !r2.text.includes(KEY), r2.text.slice(0, 120)); }
// 5) the happy path still works and is guarded
{ const r = await ask({ GEMINI_API_KEY: KEY }, () => reply(200, { candidates: [{ content: { parts: [{ text: 'เปิดทำการจันทร์-ศุกร์' }] } }] }));
  check('a normal Gemini answer is returned as source "gemini"', r.json && r.json.source === 'gemini' && r.json.answer.includes('จันทร์'), r.text.slice(0, 100)); }
// 6) bad requests are rejected before any upstream call
{ let called = false; const r = await ask({ GEMINI_API_KEY: KEY }, () => { called = true; return reply(200, {}); }, { input: '' });
  check('empty input -> 400 without calling upstream', r.status === 400 && !called); }

clearInterval(keepAlive);
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
