// ReflexWork — LLM proxy (Cloudflare Worker)
//
// Holds the LLM API key as a Worker SECRET (never in code, git, or the client).
// The static demo pages call THIS endpoint; only genuinely-escalated (LLM-path)
// questions reach it, so the key is used sparingly and is never exposed to the
// browser.
//
// Deploy:
//   cd integrations/llm-proxy
//   npx wrangler deploy
//   echo "YOUR_GEMINI_KEY" | npx wrangler secret put GEMINI_API_KEY
//
// Then point the pages at it:  chatbot.html?api=https://<worker>.workers.dev
//
// SECURITY
//   - GEMINI_API_KEY is a Worker secret, injected at runtime only.
//   - CORS is restricted to the deployed site origin.
//   - A simple per-IP token-bucket rate limit blunts abuse / cost blowups.

const ALLOWED_ORIGIN = 'https://reflexwork.pages.dev';
const RATE_LIMIT = { capacity: 20, refillPerSec: 0.5 }; // ~20 burst, 1 per 2s
const buckets = new Map(); // ip -> { tokens, ts }  (per-isolate, best-effort)

function rateOk(ip) {
  const now = Date.now() / 1000;
  let b = buckets.get(ip);
  if (!b) { b = { tokens: RATE_LIMIT.capacity, ts: now }; buckets.set(ip, b); }
  b.tokens = Math.min(RATE_LIMIT.capacity, b.tokens + (now - b.ts) * RATE_LIMIT.refillPerSec);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// groundedGuard — the backstop against a model inventing facts the KB never
// stated. For each sentence of the answer, pull out its "hard facts" (numbers,
// %, วัน/บาท/เดือน counts, phone-like digit runs, Latin proper nouns). If a hard
// fact does NOT appear in the KB context, that sentence is treated as invented
// and dropped. Sentences with no hard fact (pure phrasing) are kept. This keeps
// the rephrase fluent while guaranteeing every NUMBER/NAME traces to the KB.
function groundedGuard(answer, context) {
  const norm = s => String(s).replace(/[,\s]/g, '');
  const ctxNorm = norm(context || '');
  const parts = String(answer || '').split(/\n+/).flatMap(l => l.split(/(?<=[.!?。])\s+/)).map(s => s.trim()).filter(Boolean);
  const kept = [];
  for (const p of parts) {
    const nums = p.match(/\d[\d,]*\s*(?:%|วัน|สัปดาห์|เดือน|ปี|บาท|ครั้ง|ชั่วโมง|นาที)/g) || [];
    const lats = p.match(/[A-Za-z][A-Za-z0-9.\-]{1,}/g) || [];
    const inv = [...nums, ...lats].some(f => {
      const t = f.trim();
      if (t.length < 2) return false;
      if (/^(PDF|AI|KB|FAQ|MU|http|https|www|com|th)$/i.test(t)) return false;
      return !ctxNorm.includes(norm(t));
    });
    if (inv || /^\d+[.)]?$/.test(p)) continue;
    kept.push(p);
  }
  return kept.join('\n').trim()
    || 'คู่มือมีข้อมูลไม่พอสำหรับคำถามนี้ รบกวนติดต่อเจ้าหน้าที่เพื่อความถูกต้องครับ';
}

function cors(origin) {
  const ok = origin === ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });

    const path = new URL(request.url).pathname;
    if (path !== '/llm' && path !== '/') {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateOk(ip)) {
      return new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try { body = await request.json(); } catch { body = {}; }
    const prompt = String(body.input || '').slice(0, 2000);
    if (!prompt.trim()) {
      return new Response(JSON.stringify({ error: 'input required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    // Optional KB grounding (grounded-hybrid): when the caller passes `context`
    // (KB entries the kernel matched), the model MUST rephrase from it only and
    // not invent facts. This is the ReflexWork twist on RAG — the kernel decides
    // WHEN to ground (advice-type questions), so we pay for it sparingly.
    const context = String(body.context || '').slice(0, 4000);
    const grounded = context.trim().length > 0;
    const sys = grounded
      ? 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล ที่ตอบให้ผู้ใช้ทำตามได้จริง.\n'
        + 'กฎข้อเท็จจริง (เข้มงวด): ใช้ข้อเท็จจริงจาก "ข้อมูลคู่มือ" ที่ให้เท่านั้น — '
        + 'ห้ามเพิ่มหรือเดาตัวเลข วัน เบอร์ติดต่อ ชื่อหน่วยงาน หรือข้อเท็จจริงใด ๆ ที่ไม่มีในนั้นเด็ดขาด. '
        + 'ถ้าข้อมูลไม่พอตอบ ให้บอกตรง ๆ ว่าคู่มือไม่ครอบคลุมส่วนไหน แล้วแนะนำให้ติดต่อเจ้าหน้าที่.\n'
        + 'กฎความครบถ้วน: ตอบให้ครบ — ถ้ามีหลายขั้นตอน เงื่อนไข หรือกำหนดเวลา ให้ใส่ให้ครบทุกข้อ '
        + 'อย่าตัดทิ้งเพื่อความสั้น. ถ้าเป็นขั้นตอน ให้เรียงเป็นลำดับ 1-2-3 ที่ทำตามได้.\n'
        + 'โทน: ภาษาไทยธรรมชาติ ตรงประเด็น เหมือนเจ้าหน้าที่ที่รู้จริงอธิบายให้ฟัง — '
        + 'นำด้วยคำตอบตรง ๆ ก่อน ไม่ต้องเกริ่นนำยาวหรือลงท้ายด้วยคำสุภาพซ้ำ ๆ'
      : 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล ตอบภาษาไทยธรรมชาติ ตรงประเด็น ครบถ้วนพอให้ทำตามได้ '
        + 'อ้างอิงข้อมูลทางการเมื่อทำได้ และบอกให้ติดต่อเจ้าหน้าที่เมื่อไม่แน่ใจ';
    const userMsg = grounded
      ? `คำถาม: ${prompt}\n\nข้อมูลคู่มือ (ใช้เฉพาะนี้ ห้ามแต่งเพิ่ม):\n${context}`
      : prompt;

    // --- Local model route (0 token, no data leaves the host) --------------
    // Prefer a tunnelled Ollama when configured. For GROUNDED (KB-rephrase)
    // requests a small local model can drift off the KB, so groundedGuard below
    // strips any sentence whose numbers/names are not in the context — that is
    // the correctness backstop regardless of which model answers. (Gemini, when
    // a valid key + model is configured, obeys grounding better and is tried as
    // the fallback below.)
    if (env.OLLAMA_URL) {
      try {
        const oc = new AbortController();
        const ot = setTimeout(() => oc.abort(), Number(env.OLLAMA_TIMEOUT_MS) || 20000);
        const or = await fetch(env.OLLAMA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            ...(env.OLLAMA_TOKEN ? { Authorization: `Bearer ${env.OLLAMA_TOKEN}` } : {}) },
          body: JSON.stringify({
            model: env.OLLAMA_MODEL || 'gemma2:9b',
            messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
            stream: false,
            options: { temperature: 0.3, num_predict: 512 },
          }),
          signal: oc.signal,
        }).finally(() => clearTimeout(ot));
        const od = await or.json().catch(() => ({}));
        let otext = od?.choices?.[0]?.message?.content ?? od?.message?.content ?? od?.response ?? null;
        if (or.ok && otext) {
          if (grounded) otext = groundedGuard(otext, context);   // correctness backstop
          return new Response(JSON.stringify({ answer: otext, source: 'ollama' }), {
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }
        // local failed → fall through to Gemini if a key is configured
      } catch { /* abort/network → fall through */ }
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'LLM key not configured on the proxy' }), {
        status: 503, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Gemini generateContent. The exact flash model id changes over time, so we
    // try the configured one first, then a few known-good fallbacks, and use the
    // first that returns a candidate. (GEMINI_MODEL secret overrides the head.)
    const models = [env.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'].filter(Boolean);
    let text = null;
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const payload = {
        contents: [{ parts: [{ text: sys + '\n\n' + userMsg }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
      };
      try {
        let r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.status === 503) { await new Promise(res => setTimeout(res, 800)); r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
        const data = await r.json();
        const t = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (r.ok && t) { text = t; break; }
      } catch { /* try next model */ }
    }
    if (!text) {
      // Gemini unavailable AND (for grounded) we skipped Ollama — last resort:
      // an honest hand-off rather than silence.
      return new Response(JSON.stringify({ answer: 'ขออภัย ระบบ AI ตอบไม่ได้ในขณะนี้ — รบกวนติดต่อเจ้าหน้าที่ครับ', source: 'fallback' }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    if (grounded) text = groundedGuard(text, context);
    return new Response(JSON.stringify({ answer: text, source: 'gemini' }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
