// The LLM proxy (integrations/llm-proxy/worker.mjs) must ALWAYS answer within its budget and say why a backend failed.
// Run: node tests/llm_proxy.test.mjs   (no network: upstream is mocked)
//   regression for 2026-11-03: a stalled upstream left the request hanging for > 90 s with nothing in the logs.
import worker, { pickModels, resetGeminiState } from '../integrations/llm-proxy/worker.mjs';

let pass = 0, fail = 0, n = 0;
const keepAlive = setInterval(() => {}, 50);   // Node's AbortSignal.timeout() timers are unref'd; Workers keep a request alive, Node would exit mid-await
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const realFetch = globalThis.fetch;
const hang = (_u, init) => new Promise((_, rej) => init && init.signal && init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: init.signal.reason && init.signal.reason.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError' }))));
const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const KEY = 'SECRET-KEY-DO-NOT-LEAK-123';
async function ask(env, upstream, body = { input: 'สวัสดี', context: '[1] ทดสอบ\nเปิดทำการจันทร์-ศุกร์' }, keep = false) {
  if (!keep) resetGeminiState();
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


// --- model discovery: names churn (1.5 gone 2025-09, 2.0 gone 2026-06), so the proxy asks the API what this key can call -------------
const GC = ['generateContent', 'countTokens'];
const LIST = [
  { name: 'models/gemini-1.5-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.9-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.10-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.10-flash-lite', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.10-flash-preview-05-20', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.10-flash-image', supportedGenerationMethods: GC },
  { name: 'models/gemini-3.10-flash-live-001', supportedGenerationMethods: ['bidiGenerateContent'] },
  { name: 'models/gemini-3.10-pro', supportedGenerationMethods: GC },
  { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
];
{ const got = pickModels(LIST);
  check('picks stable Flash first, newest first (3.10 > 3.9: numeric, not text, order), then Flash-Lite', got.slice(0, 3).join() === 'gemini-3.10-flash,gemini-3.9-flash,gemini-2.5-flash' && got.indexOf('gemini-3.10-flash-lite') > got.indexOf('gemini-1.5-flash'), got.join()); 
  check('never picks preview / image / live / pro / embedding / non-generateContent models', !got.some(id => /preview|image|live|pro|embedding/.test(id)), got.join()); }
check('with only preview Flash models it still finds one (loose fallback), never image / tts', pickModels([{ name: 'models/gemini-4-flash-preview', supportedGenerationMethods: GC }, { name: 'models/gemini-4-flash-image', supportedGenerationMethods: GC }]).join() === 'gemini-4-flash-preview');
check('empty / malformed lists give no model instead of throwing', pickModels([]).length === 0 && pickModels(undefined).length === 0 && pickModels([null, {}, { name: 5 }]).length === 0);
{ const calls = []; 
  const up = (url, init) => { const u = String(url); calls.push(u.replace(/key=[^&]+/, 'key=…')); if (u.includes('/v1beta/models?')) return reply(200, { models: LIST }); return reply(200, { candidates: [{ content: { parts: [{ text: 'เปิดทำการจันทร์-ศุกร์' }] } }] }); };
  const r = await ask({ GEMINI_API_KEY: KEY }, up); const used = calls.find(c => c.includes(':generateContent'));
  check('uses the newest model the API lists, not a hard-coded name', r.json && r.json.source === 'gemini' && /models\/gemini-3\.10-flash:generateContent/.test(used || ''), used);
  const before = calls.filter(c => c.includes('/v1beta/models?')).length; await ask({ GEMINI_API_KEY: KEY }, up, undefined, true);   // keep = same isolate, memory not reset
  check('the model list is cached (one list call serves later requests)', calls.filter(c => c.includes('/v1beta/models?')).length === before, `${before} -> ${calls.filter(c => c.includes('/v1beta/models?')).length}`); }


// --- thinking: ask for a low level; never shrink maxOutputTokens; retry without it when a model rejects the field -----------------------
{ const bodies = [];
  const up = (url, init) => { const u2 = String(url); if (u2.includes('/v1beta/models?')) return reply(200, { models: LIST }); bodies.push(JSON.parse(init.body)); return reply(200, { candidates: [{ content: { parts: [{ text: 'ความคิด', thought: true }, { text: 'คำตอบจริง' }] } }] }); };
  const r = await ask({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'm-think' }, up);
  const g = bodies[0] && bodies[0].generationConfig;
  check('asks for thinkingLevel "low" and does not cap the output at 512', g && g.thinkingConfig && g.thinkingConfig.thinkingLevel === 'low' && g.maxOutputTokens >= 1024, JSON.stringify(g));
  check('thought parts are not shown to the user; only the answer text is returned', r.json && r.json.answer === 'คำตอบจริง', r.text.slice(0, 100)); }
{ const seen = {};
  const up = (url, init) => { const u2 = String(url); if (u2.includes('/v1beta/models?')) return reply(200, { models: LIST }); const m = u2.match(/models\/([^:]+):generateContent/)[1]; const cfg = JSON.parse(init.body).generationConfig; (seen[m] ||= []).push(!!cfg.thinkingConfig); return cfg.thinkingConfig ? reply(400, { error: { status: 'INVALID_ARGUMENT' } }) : reply(200, { candidates: [{ content: { parts: [{ text: 'ตอบได้' }] } }] }); };
  const r = await ask({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'm-old' }, up);
  check('a model that rejects thinkingLevel is retried once without it and then answers', r.json && r.json.source === 'gemini' && String(seen['m-old']) === 'true,false', JSON.stringify(seen)); }

// --- waves: the newest models can be overloaded / hung / listed-but-gone; the first good answer wins, siblings are cancelled -----------------
const ok200 = text => reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
const modelOf = url => (String(url).match(/models\/([^:?]+):generateContent/) || [])[1];
{ // the owner's real situation on 2026-11-03, compressed in time: newest 503, next hangs, third 503, a later one is healthy
  const calls = [];
  const up = (url, init) => { const u2 = String(url); if (u2.includes('/v1beta/models?')) return reply(200, { models: LIST }); const m = modelOf(u2); calls.push(m);
    if (m === 'gemini-3.10-flash' || m === 'gemini-2.5-flash') return reply(503, { error: { status: 'UNAVAILABLE' } });
    if (m === 'gemini-3.9-flash') return hang(url, init);
    return ok200('ตอบจากรุ่นที่สอง'); };
  const r = await ask({ GEMINI_API_KEY: KEY, GEMINI_TIMEOUT_MS: 500, LLM_BUDGET_MS: 6000 }, up);
  check('when the first three models are overloaded / hung, the next wave answers', r.json && r.json.source === 'gemini' && r.json.answer === 'ตอบจากรุ่นที่สอง' && r.ms < 3000, `${r.ms} ms ${r.text.slice(0, 100)}`);
  check('...and it did not wait for the hung model one after another (3 models were asked together first)', calls.slice(0, 3).sort().join() === 'gemini-2.5-flash,gemini-3.10-flash,gemini-3.9-flash', calls.join()); }
{ let sibling = null; // the first success cancels the others
  const up = (url, init) => { const u2 = String(url); if (u2.includes('/v1beta/models?')) return reply(200, { models: LIST }); const m = modelOf(u2); if (m === 'gemini-3.10-flash') return ok200('เร็วที่สุด'); sibling = init.signal; return hang(url, init); };
  const r = await ask({ GEMINI_API_KEY: KEY }, up);
  check('the first good answer wins and the slower siblings are cancelled', r.json && r.json.answer === 'เร็วที่สุด' && sibling && sibling.aborted, String(sibling && sibling.aborted)); }
{ const calls = []; // memory: the model that worked goes first next time; one that is gone (404) is not asked again
  const up = (url, init) => { const u2 = String(url); if (u2.includes('/v1beta/models?')) return reply(200, { models: LIST }); const m = modelOf(u2); calls.push(m);
    if (m === 'gemini-3.10-flash') return reply(404, { error: { status: 'NOT_FOUND' } });
    return m === 'gemini-3.9-flash' ? ok200('รุ่นที่ใช้ได้') : hang(url, init); };
  await ask({ GEMINI_API_KEY: KEY, GEMINI_TIMEOUT_MS: 400, LLM_BUDGET_MS: 5000 }, up);
  calls.length = 0; const r2 = await ask({ GEMINI_API_KEY: KEY, GEMINI_TIMEOUT_MS: 400, LLM_BUDGET_MS: 5000 }, up, undefined, true);
  check('next request: the last good model is asked first and a 404 model is skipped', calls[0] === 'gemini-3.9-flash' && !calls.includes('gemini-3.10-flash') && r2.json && r2.json.answer === 'รุ่นที่ใช้ได้', calls.join()); }
{ const r = await ask({ GEMINI_API_KEY: KEY, GEMINI_TIMEOUT_MS: 300, LLM_BUDGET_MS: 2000 }, (url, init) => String(url).includes('/v1beta/models?') ? reply(200, { models: LIST }) : hang(url, init));
  check('when every wave fails it still answers within the budget, listing what was skipped', r.ms < 3500 && r.json && r.json.source === 'fallback' && r.json.detail.some(d => /skipped\(budget\)/.test(d)), `${r.ms} ms ${JSON.stringify(r.json && r.json.detail)}`); }

clearInterval(keepAlive);
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
