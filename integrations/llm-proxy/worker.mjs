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

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'LLM key not configured on the proxy' }), {
        status: 503, headers: { ...headers, 'Content-Type': 'application/json' },
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

    // Gemini generateContent (free-tier friendly model).
    const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    const sys = 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล ตอบสั้น กระชับ ภาษาไทย '
              + 'อ้างอิงข้อมูลทางการเมื่อทำได้ และบอกให้ติดต่อเจ้าหน้าที่เมื่อไม่แน่ใจ';
    const payload = {
      contents: [{ parts: [{ text: sys + '\n\nคำถาม: ' + prompt }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
    };

    try {
      let r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (r.status === 503) { await new Promise(res => setTimeout(res, 800)); r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'ขออภัย ระบบ AI ตอบไม่ได้ในขณะนี้ กรุณาติดต่อเจ้าหน้าที่';
      return new Response(JSON.stringify({ answer: text }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'LLM upstream error' }), {
        status: 502, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
  },
};
