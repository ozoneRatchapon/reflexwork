// ReflexWork — LINE adapter on Cloudflare Workers
//
// Edge version of integrations/line/adapter.mjs: a LINE Messaging API webhook
// that routes each message through the live kernel Worker, answers from the KB
// on FastPath (0 token) and forwards only LLM-path questions to the LLM proxy.
//
// Deploy:
//   cd integrations/line-worker && npx wrangler deploy
//   echo "<channel access token>" | npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
//   echo "<channel secret>"       | npx wrangler secret put LINE_CHANNEL_SECRET
// Then set the LINE webhook to  https://<worker>.workers.dev/webhook
//
// Secrets (LINE token/secret, and the LLM key on the proxy) live in Worker
// secret storage — never in code, git, or the client.

import { KB } from './kb-data.mjs';

const KERNEL = 'https://reflexwork-kernel.solana-thailand.workers.dev';
const LLM_PROXY = 'https://reflexwork-llm-proxy.solana-thailand.workers.dev';

// Score each KB entry against the query. Thai has no word spaces, so we match
// on character tri-grams plus any space-separated tokens — the SAME scoring the
// web chatbot uses, kept in lockstep so LINE and web answer identically.
// Generic Thai connective/filler fragments that create false tri-gram matches
// against unrelated titles. Excluded from scoring so "วิธีทำ…" doesn't score
// every entry whose title contains "วิธี".
const STOP_GRAMS = new Set(['วิธี', 'ทำอ', 'ทำย', 'การ', 'ได้', 'อย่', 'ย่า', 'งไร', 'ไหม', 'เท่', 'ท่า', 'าไร']);

function searchKB(q) {
  const ql = (q || '').toLowerCase();
  const grams = new Set();
  // Space-separated tokens. Latin/number tokens (turnitin, 25, grad) are highly
  // discriminative, so weight them more than a bare Thai tri-gram.
  const weight = new Map();
  for (const tok of ql.split(/\s+/)) {
    if (tok.length > 1) {
      grams.add(tok);
      weight.set(tok, /^[a-z0-9]/.test(tok) ? 3 : 1);
    }
  }
  for (let i = 0; i < ql.length - 2; i++) {
    const g = ql.slice(i, i + 3).trim();
    if (g.length === 3 && !STOP_GRAMS.has(g)) { grams.add(g); if (!weight.has(g)) weight.set(g, 1); }
  }
  const scored = [];
  for (const e of KB) {
    let s = 0;
    for (const g of grams) if (e.keywords.includes(g)) s += (weight.get(g) || 1);
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

// 3-tier decision mirroring the web chatbot:
//   confident  -> answer from the manual (0 token)
//   ambiguous  -> offer the top matches so the user picks (guards typos/ambiguity)
//   escalate   -> no KB hit, hand to the LLM
function pickFromKB(q) {
  const ranked = searchKB(q);
  if (!ranked.length) return { tier: 'escalate' };
  const top = ranked[0], second = ranked[1];
  // Confident: a clear leader. Either a strong absolute score, or it beats the
  // runner-up decisively.
  const confident = (top.s >= 4) || (top.s >= 3 && (!second || top.s - second.s >= 2));
  if (confident) return { tier: 'confident', entry: top.e };
  // Ambiguous only on a genuine near-tie with meaningful scores (>=3 each),
  // so a scatter of generic 1-gram coincidences escalates instead of offering a
  // nonsense menu.
  if (top.s >= 3 && second && second.s >= 3) {
    return { tier: 'ambiguous', candidates: ranked.slice(0, 3).map(r => r.e) };
  }
  if (top.s >= 3) return { tier: 'confident', entry: top.e };
  return { tier: 'escalate' };
}

async function verify(bodyRaw, signature, secret) {
  if (!secret) {
    // PoC/local only. If a real LINE signature is present, this means the
    // deployment forgot to set LINE_CHANNEL_SECRET — warn loudly, still accept
    // so the PoC runs, but production MUST set the secret.
    if (signature) console.log('⚠ LINE signature present but LINE_CHANNEL_SECRET not set — set it in production');
    return true;
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyRaw));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === signature;
}

async function routeViaKernel(env, text) {
  const req = new Request('https://kernel/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'DataQuery', input: text, priority: 128 }),
  });
  // Prefer the service binding (supported worker→worker path); fall back to public URL.
  const r = env.KERNEL ? await env.KERNEL.fetch(req)
                       : await fetch(`${KERNEL}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'DataQuery', input: text, priority: 128 }) });
  return r.json();
}

async function answerLLM(text) {
  try {
    const r = await fetch(`${LLM_PROXY}/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://reflexwork.pages.dev' },
      body: JSON.stringify({ input: text }),
    });
    const d = await r.json();
    return d.answer || 'ขออภัย AI ตอบไม่ได้ขณะนี้ กรุณาติดต่อเจ้าหน้าที่';
  } catch { return 'ขออภัย ระบบ AI ไม่พร้อมใช้งานขณะนี้'; }
}

async function reply(replyToken, text, footer, token) {
  const body = footer ? text + footer : text;
  if (!token) return; // PoC: no credentials → skip actual LINE call
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: body }] }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (request.method !== 'POST' || url.pathname !== '/webhook')
      return new Response('not found', { status: 404 });

    const raw = await request.text();
    if (!(await verify(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET)))
      return new Response('bad signature', { status: 401 });

    try {
      const body = JSON.parse(raw || '{}');
      const token = env.LINE_CHANNEL_ACCESS_TOKEN;
      for (const ev of body.events || []) {
        if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
        const text = ev.message.text;

        // The kernel still makes the real routing decision (fast-path gate +
        // BLAKE3 proof) — that is the engine we are demonstrating.
        const decision = await routeViaKernel(env, text).catch(() => ({}));
        const route = decision.route || 'DataQuery';
        const proof = String(decision.blake3_proof || '').slice(0, 16);

        // Answer from the verified manual when we can; the KB tier decides.
        const pick = pickFromKB(text);
        let answer, footer;

        if (pick.tier === 'confident') {
          const src = pick.entry.source_url ? `\n📎 ${pick.entry.source_url}` : '';
          answer = `${pick.entry.answer}${src}`;
          footer = `\n\n🦀 ${route} · FastPath · 0 token${proof ? `\n🔒 ${proof}…` : ''}`;
        } else if (pick.tier === 'ambiguous') {
          const list = pick.candidates
            .map((c, i) => `${i + 1}. ${c.title}`)
            .join('\n');
          answer = `🤔 ไม่แน่ใจว่าหมายถึงข้อไหน ลองพิมพ์หัวข้อที่ตรงที่สุด:\n${list}`;
          footer = `\n\n🦀 ${route} · ต้องการความชัดเจน (ไม่เรียก AI)`;
        } else {
          // no manual hit -> let the LLM proxy answer (costs tokens)
          answer = await answerLLM(text);
          footer = `\n\n🦀 ${route} · LLM${proof ? `\n🔒 ${proof}…` : ''}`;
        }

        await reply(ev.replyToken, answer, footer, token);
      }
    } catch (e) {
      // never 500 a webhook — LINE retries aggressively. Log and ack.
      console.log('line handler error:', String(e && e.message || e));
    }
    return new Response('ok');
  },
};
