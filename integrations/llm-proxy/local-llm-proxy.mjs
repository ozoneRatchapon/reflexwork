#!/usr/bin/env node
// ReflexWork — LOCAL LLM proxy (Node, zero dependencies)
// ----------------------------------------------------------------------------
// A drop-in local replacement for the Cloudflare `llm-proxy` Worker, for DEMO.
// It speaks the SAME contract the web chatbot expects (POST /llm {input} ->
// {answer}), but forwards to a LOCAL Ollama model instead of Gemini — so the
// LLM path costs 0 token and no data leaves this machine.
//
// WHY this exists: a Cloudflare Worker (the edge proxy) cannot reach localhost
// Ollama, and the free quick-tunnel edge blocks API traffic (403). Running the
// proxy HERE, on the same machine as Ollama, sidesteps both — localhost talks
// to localhost. Perfect for a laptop demo.
//
// Usage:
//   OLLAMA_MODEL=scb10x/llama3.2-typhoon2-3b-instruct node local-llm-proxy.mjs
//   # then open the chatbot pointing at this proxy:
//   #   http://127.0.0.1:5173/chatbot.html?api=http://127.0.0.1:8787
//
// Env:
//   PORT          (default 8787)
//   OLLAMA_URL    (default http://127.0.0.1:11434/v1/chat/completions)
//   OLLAMA_MODEL  (default scb10x/llama3.2-typhoon2-3b-instruct)
// ----------------------------------------------------------------------------
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = process.env.OLLAMA_MODEL || 'scb10x/llama3.2-typhoon2-3b-instruct';
const SYS = 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล ตอบสั้น กระชับ ภาษาไทย '
          + 'อ้างอิงข้อมูลทางการเมื่อทำได้ และบอกให้ติดต่อเจ้าหน้าที่เมื่อไม่แน่ใจ';

// CORS: allow any localhost origin + the deployed Pages origin, so the chatbot
// works whether served locally or from reflexwork.pages.dev with ?api= here.
function cors(origin) {
  const ok = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
           || origin === 'https://reflexwork.pages.dev';
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Backstop against invented facts: drop any sentence whose hard facts (numbers,
// %, day/baht counts, Latin proper nouns) are NOT present in the KB context.
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

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const headers = { ...cors(origin), 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') { res.writeHead(204, cors(origin)); return res.end(); }

  const path = new URL(req.url, `http://x`).pathname;
  if (path === '/health') { res.writeHead(200, headers); return res.end(JSON.stringify({ ok: true, model: MODEL })); }
  if (req.method !== 'POST' || (path !== '/llm' && path !== '/')) {
    res.writeHead(404, headers); return res.end(JSON.stringify({ error: 'not found' }));
  }

  let raw = ''; for await (const c of req) raw += c;
  let input = '', context = '';
  try { const b = JSON.parse(raw || '{}'); input = String(b.input || '').slice(0, 2000); context = String(b.context || '').slice(0, 4000); } catch { /* empty */ }
  if (!input.trim()) { res.writeHead(400, headers); return res.end(JSON.stringify({ error: 'input required' })); }

  const grounded = context.trim().length > 0;
  const sys = grounded
    ? 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล ที่ตอบให้ผู้ใช้ทำตามได้จริง. '
      + 'กฎข้อเท็จจริง (เข้มงวด): ใช้ข้อเท็จจริงจาก "ข้อมูลคู่มือ" ที่ให้เท่านั้น ห้ามเพิ่มหรือเดาตัวเลข วัน '
      + 'เบอร์ติดต่อ ชื่อหน่วยงาน หรือข้อเท็จจริงที่ไม่มีในนั้นเด็ดขาด หากไม่พอ ให้บอกว่าคู่มือไม่ครอบคลุมส่วนไหน '
      + 'แล้วแนะนำให้ติดต่อเจ้าหน้าที่. กฎความครบถ้วน: ใส่ทุกขั้นตอน เงื่อนไข กำหนดเวลาให้ครบ อย่าตัดทิ้ง '
      + 'ถ้าเป็นขั้นตอนให้เรียง 1-2-3. โทน: ภาษาไทยธรรมชาติ ตรงประเด็น นำด้วยคำตอบก่อน ไม่ต้องเกริ่นยาว'
    : SYS;
  const userMsg = grounded ? `คำถาม: ${input}\n\nข้อมูลคู่มือ (ใช้เฉพาะนี้ ห้ามแต่งเพิ่ม):\n${context}` : input;

  try {
    const r = await fetch(OLLAMA_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
        stream: false, options: { temperature: 0.3, num_predict: 512 },
      }),
    });
    const data = await r.json().catch(() => ({}));
    let answer = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data?.response
                 ?? 'ขออภัย โมเดล local ตอบไม่ได้ในขณะนี้';
    if (grounded) answer = groundedGuard(answer, context);
    res.writeHead(200, headers);
    res.end(JSON.stringify({ answer, source: 'ollama-local', model: MODEL }));
  } catch (e) {
    res.writeHead(502, headers);
    res.end(JSON.stringify({ error: 'local model unreachable — is `ollama serve` running?' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ ReflexWork local LLM proxy on http://127.0.0.1:${PORT}`);
  console.log(`  model: ${MODEL}`);
  console.log(`  → open: http://127.0.0.1:5173/chatbot.html?api=http://127.0.0.1:${PORT}`);
});
