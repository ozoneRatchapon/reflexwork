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
import { askTeam } from '../_shared/team-adapter.mjs';
import { humanize } from '../_shared/humanize.mjs';
import { decide } from '../_shared/rethink.mjs';

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
function pickFromKB(q, gate) {
  const ranked = searchKB(q);
  if (!ranked.length) return { tier: 'escalate', stage: 'reflex', reason: 'ไม่พบในคู่มือ' };
  // Delegate to the shared rethink layer (System 1 / System 2). It recovers a
  // FastPath answer in the borderline band instead of paying for an LLM.
  const v = decide({ gate, ranked });
  const tier = v.action === 'act' ? 'confident'
             : v.action === 'disambiguate' ? 'ambiguous'
             : 'escalate';
  return { tier, stage: v.stage, reason: v.reason, entry: v.entry, candidates: v.candidates };
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

// Record a question the KB could not answer, so staff get a backlog of what to
// add. Uses the kernel's /gap endpoint (via service binding when available).
async function logGapViaKernel(env, text) {
  const payload = JSON.stringify({ q: text, source: 'line' });
  const req = new Request(`${KERNEL}/gap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://reflexwork.pages.dev' },
    body: payload,
  });
  if (env.KERNEL) return env.KERNEL.fetch(req);
  return fetch(`${KERNEL}/gap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
}

// Graceful fallback shown when the LLM is unavailable (quota/throttle/outage).
// Redirects the user to the verified manual, which always works — so a demo
// never dead-ends on a Gemini hiccup.
const LLM_UNAVAILABLE =
  'ตอนนี้ผู้ช่วย AI มีผู้ใช้งานจำนวนมาก ขออภัยในความไม่สะดวก 🙏\n' +
  'ระหว่างนี้ลองถามเรื่องที่มีในคู่มือได้ทันที เช่น:\n' +
  '• ส่งรูปเล่มภายในกี่วัน\n' +
  '• ค่าสอบ MU GRAD Plus เท่าไร\n' +
  '• ตรวจบทคัดย่อใช้เวลากี่วัน\n' +
  'หรือพิมพ์คำถามใหม่อีกครั้งในอีกสักครู่\n' +
  '\nถ้าต้องการติดต่อเจ้าหน้าที่โดยตรง: https://graduate.mahidol.ac.th/thai/contact-us/';

async function answerLLM(text, env) {
  // LLM path goes through the team-integration adapter. By default the provider
  // is 'gemini' (our proxy) → behavior is unchanged. To forward to ANOTHER
  // team's backend (e.g. gradmahidol-ai), set TEAM_API_PROVIDER=gradmahidol +
  // TEAM_API_URL (+ TEAM_API_KEY) as Worker secrets — no code change needed.
  // env may be undefined in older call sites; fall back to the gemini proxy URL.
  const bag = { LLM_PROXY, ...(env || {}) };
  const r = await askTeam(text, bag);              // {text, ok, source}
  return r.ok ? { text: r.text, ok: true } : { text: LLM_UNAVAILABLE, ok: false };
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

// Process one webhook body: route + answer + reply. Runs AFTER we have already
// returned 200 to LINE (via ctx.waitUntil), so a slow kernel/LLM call never
// trips LINE's ~1s webhook timeout (which showed up as "Canceled" requests).
async function processEvents(raw, env) {
  try {
    const body = JSON.parse(raw || '{}');
    const token = env.LINE_CHANNEL_ACCESS_TOKEN;
    for (const ev of body.events || []) {
      if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
      const text = ev.message.text;

      // The kernel still makes the real routing decision (fast-path gate +
      // BLAKE3 proof) — we keep its proof as tamper-evidence on the reply.
      const decision = await routeViaKernel(env, text).catch(() => ({}));
      const proof = String(decision.blake3_proof || '').slice(0, 16);

      // Prefer the kernel's raw sigmoid gate score g; fall back to a proxy from
      // fast_path + complexity only if an older kernel build lacks the field.
      const cNum = typeof decision.gate_dim8_complexity === 'number' ? decision.gate_dim8_complexity : 0.5;
      const gateProxy = (typeof decision.gate_score === 'number')
        ? decision.gate_score
        : (decision.fast_path ? Math.min(0.59, 0.30 + cNum * 0.25)
                              : Math.max(0.70, 0.60 + cNum * 0.35));

      // Answer from the verified manual when we can; the rethink layer decides,
      // recovering a FastPath answer in the borderline band instead of paying
      // for an LLM. The footer shows the true path + reflex/rethink stage.
      const pick = pickFromKB(text, gateProxy);
      const stageTag = pick.stage === 'rethink' ? ' 🔁 rethink' : '';
      let answer, footer;

      if (pick.tier === 'confident') {
        const src = pick.entry.source_url ? `\n📎 ${pick.entry.source_url}` : '';
        // Guided steps as a numbered list when the entry carries them.
        const steps = Array.isArray(pick.entry.steps) && pick.entry.steps.length
          ? `\n\nทำตามขั้นตอน:\n${pick.entry.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
          : '';
        answer = `${humanize(pick.entry, text)}${steps}${src}`;
        footer = `\n\n🦀 FastPath · ตอบจากคู่มือ · 0 token${stageTag}${proof ? `\n🔒 ${proof}…` : ''}`;
      } else if (pick.tier === 'ambiguous') {
        const list = pick.candidates.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
        answer = `🤔 ไม่แน่ใจว่าหมายถึงข้อไหน ลองพิมพ์หัวข้อที่ตรงที่สุด:\n${list}`;
        footer = `\n\n🦀 ต้องการความชัดเจน · ยังไม่เรียก AI${stageTag}`;
      } else {
        // Gap log: KB could not answer → record it for the staff backlog
        // (fire-and-forget; a logging failure must never block the reply).
        logGapViaKernel(env, text).catch(() => {});
        const llm = await answerLLM(text, env);
        answer = llm.text;
        footer = llm.ok
          ? `\n\n🦀 LLM path · ตอบโดย AI${stageTag}${proof ? `\n🔒 ${proof}…` : ''}`
          : ''; // fallback message already explains itself; no footer noise
      }

      await reply(ev.replyToken, answer, footer, token);
    }
  } catch (e) {
    console.log('line handler error:', String(e && e.message || e));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (request.method !== 'POST' || url.pathname !== '/webhook')
      return new Response('not found', { status: 404 });

    const raw = await request.text();
    if (!(await verify(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET)))
      return new Response('bad signature', { status: 401 });

    // Ack LINE immediately (it times out webhooks in ~1s), then do the slow
    // routing/LLM/reply work in the background. The replyToken stays valid for
    // ~1 minute, so an async reply still lands.
    ctx.waitUntil(processEvents(raw, env));
    return new Response('ok');
  },
};
