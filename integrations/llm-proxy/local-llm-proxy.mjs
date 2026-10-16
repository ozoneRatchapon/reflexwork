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
    ? 'คุณเป็นผู้ช่วยบัณฑิตวิทยาลัย ม.มหิดล เรียบเรียงคำตอบเป็นภาษาคนที่อ่านลื่น กฎเข้ม: ใช้ข้อเท็จจริง'
      + 'จาก "ข้อมูลคู่มือ" ที่ให้เท่านั้น ห้ามเพิ่มตัวเลข เบอร์ติดต่อ ชื่อหน่วยงาน หรือข้อเท็จจริงที่ไม่มีในนั้น'
      + 'เด็ดขาด หากข้อมูลไม่พอ ให้บอกว่าคู่มือไม่ครอบคลุมและแนะนำให้ติดต่อเจ้าหน้าที่ ตอบสั้น กระชับ ภาษาไทย'
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
    const answer = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data?.response
                 ?? 'ขออภัย โมเดล local ตอบไม่ได้ในขณะนี้';
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
