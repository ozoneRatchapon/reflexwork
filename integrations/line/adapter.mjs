// ReflexWork — LINE adapter (proof-of-concept)
//
// Bridges a LINE Messaging API webhook to the Reflex Kernel's REST API.
// ReflexWork does NOT replace a team's chatbot — it sits IN FRONT of it as a
// screening layer: the kernel decides FastPath vs LLM, so the expensive LLM is
// only called for questions that genuinely need it (~80% cost cut).
//
//   LINE user ──▶ this adapter ──▶ POST /route (kernel decides)
//                                    ├─ FastPath → answer from KB, 0 token
//                                    └─ LLM path → forward to the team's own LLM
//
// Run (PoC):
//   REFLEX_URL=http://127.0.0.1:8787 LINE_CHANNEL_ACCESS_TOKEN=xxx \
//   LINE_CHANNEL_SECRET=yyy node integrations/line/adapter.mjs
//
// This is a reference PoC: it shows the integration shape. Signature
// verification and the KB/LLM answer sources are marked where a real
// deployment plugs in the team's own systems.

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3100);
const REFLEX_URL = process.env.REFLEX_URL || 'http://127.0.0.1:8787';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET || '';

// --- 1. verify the LINE signature (never trust an unsigned webhook) ----------
function verifyLineSignature(bodyRaw, signature) {
  if (!LINE_SECRET) return true; // PoC: skip when no secret configured
  const hmac = crypto.createHmac('sha256', LINE_SECRET).update(bodyRaw).digest('base64');
  // timing-safe compare
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ''));
  } catch { return false; }
}

// --- 2. ask the kernel how to route this message -----------------------------
async function routeViaKernel(text) {
  const res = await fetch(`${REFLEX_URL}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'DataQuery', input: text, priority: 128 }),
  });
  if (!res.ok) throw new Error(`kernel /route ${res.status}`);
  return res.json(); // { route, fast_path, kernel_us, blake3_proof, token_cost, ... }
}

// --- 3. answer sources (plug in the team's own systems here) -----------------
async function answerFromKB(_text) {
  // Real deployment: query the team's knowledge base / vector store.
  // PoC returns a placeholder so the flow is runnable without their data.
  return 'พบคำตอบในคู่มือ (เสียบ KB ของทีมตรงนี้) — ตอบทันที ไม่เรียก AI';
}
async function answerFromLLM(text) {
  // Real deployment: forward to the team's own LLM (Gemini / Bedrock / OpenRouter).
  // PoC does not call a paid model; it echoes the intent.
  return `คำถามนี้ซับซ้อน kernel ส่งต่อให้ AI ของทีมช่วยตอบ: "${text}"`;
}

// --- 4. reply to LINE --------------------------------------------------------
async function replyToLine(replyToken, text, decision) {
  const footer = `\n\n🦀 kernel: ${decision.route} · ⚡${(decision.kernel_us ?? 0).toFixed?.(1) ?? decision.kernel_us}µs`
               + ` · ${decision.fast_path ? '0 token' : 'LLM'}\n🔒 ${String(decision.blake3_proof).slice(0, 16)}…`;
  if (!LINE_TOKEN) { console.log('[PoC reply]', text + footer); return; }
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text + footer }] }),
  });
}

// --- 5. webhook server -------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    if (!verifyLineSignature(raw, req.headers['x-line-signature'])) {
      res.writeHead(401).end('bad signature');
      return;
    }
    res.writeHead(200).end('ok'); // ack LINE immediately

    let body;
    try { body = JSON.parse(raw); } catch { return; }
    for (const ev of body.events || []) {
      if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
      const text = ev.message.text;
      try {
        const decision = await routeViaKernel(text);
        const answer = decision.fast_path ? await answerFromKB(text) : await answerFromLLM(text);
        await replyToLine(ev.replyToken, answer, decision);
      } catch (e) {
        console.error('route/reply failed:', e.message);
      }
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ReflexWork LINE adapter (PoC) on http://127.0.0.1:${PORT}/webhook`);
  console.log(`→ kernel at ${REFLEX_URL}  ·  LINE token ${LINE_TOKEN ? 'set' : 'NOT set (PoC log mode)'}`);
});
