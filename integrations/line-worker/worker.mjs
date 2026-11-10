// ReflexWork — LINE adapter on Cloudflare Workers
//
// Edge version of integrations/line/adapter.mjs: a LINE Messaging API webhook. Each message goes through the SAME Rust decision order
// as the web chat (the Router of crates/reflex-wasm); views.mjs turns the decision into LINE text. Manual answers cost 0 token; only
// advice questions are rephrased by the grounded LLM proxy. The kernel Worker still counts each question (dashboard, audit, proof).
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
import { groundedContext, groundedPrompt } from '../_shared/intake.mjs';
import { lineView, notInManualText as notInManualReply } from './views.mjs';
// The SAME Rust decision order as the web page (plan 009 C4): crates/reflex-wasm, built by crates/reflex-wasm/build.sh into
// submissions/ui/wasm (one build for both). It also carries the PDPA mask (crates/pii-mask, docs/pdpa-check.md O2): the question is
// masked before it goes to the AI proxy or the gap list.
import routerWasm from '../../submissions/ui/wasm/reflex_wasm_bg.wasm';
import { initSync, Router, mask_pii, classify_issue } from '../../submissions/ui/wasm/reflex_wasm.js';
initSync({ module: routerWasm });

const KERNEL = 'https://reflexwork-kernel.solana-thailand.workers.dev';
const LLM_PROXY = 'https://reflexwork-llm-proxy.solana-thailand.workers.dev';

// Built ONCE per isolate, at module scope: ~10 ms of startup CPU (limit 1 s), then a decision is <1 ms. Built lazily inside a request it
// could use up the Free plan's 10 ms request CPU (benchmark/coldstart/001_line_router_startup.md). No programme catalogue: LINE shows no
// programme cards (that would be ~19 ms of startup and a 6 MB bundle).
const ROUTER = new Router(KB, null, undefined);
const BY_ID = new Map(KB.map(e => [e.id, e]));

/** Today in Asia/Bangkok (UTC+7, no DST), YYYY-MM-DD: the decision reads dates against it and never reads a clock itself. */
export const todayBangkok = (now = Date.now()) => new Date(now + 7 * 3600e3).toISOString().slice(0, 10);

/** LINE's state for the router: no catalogue, no tapped topic, no programme in focus; the AI is on (the grounded proxy). */
export const lineState = today => ({ progState: 'none', aiOff: false, pinnedId: null, programmeInFocus: null, today, agencyHasIt: true });

/** The router's decision for one LINE message: {route, entry, offered, kind, stage, personal, stuck, ...} (route null = not found). */
export function decideLine(text, today = todayBangkok()) {
  return ROUTER.decision(String(text || ''), lineState(today), null);
}

/** Titles of the nearest entries that share real words with the question (score >= 3), at most 3. */
export function nearTitles(q) {
  return ROUTER.search(String(q || ''), 3).filter(h => h.s >= 3).map(h => BY_ID.get(h.id)?.title).filter(Boolean);
}

// Reply when the manual has no answer (exported for tests).
export const notInManualText = q => notInManualReply(nearTitles(q));

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
  const payload = JSON.stringify({ q: mask_pii(String(text || '')), source: 'line' });
  const req = new Request(`${KERNEL}/gap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://reflexwork.pages.dev' },
    body: payload,
  });
  if (env.KERNEL) return env.KERNEL.fetch(req);
  return fetch(`${KERNEL}/gap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
}

// Save a staff-provided answer as a pending KB draft (via the kernel). Returns
// {ok} so the #kb command can confirm. Mirrors logGapViaKernel's transport.
async function saveKbDraft(env, question, answer) {
  const payload = JSON.stringify({ question, answer, source: 'line-staff' });
  const req = new Request(`${KERNEL}/kb-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://reflexwork.pages.dev',
      ...(env.STAFF_TOKEN ? { 'X-Staff-Token': env.STAFF_TOKEN } : {}) },
    body: payload,
  });
  const r = env.KERNEL ? await env.KERNEL.fetch(req)
                       : await fetch(`${KERNEL}/kb-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.STAFF_TOKEN ? { 'X-Staff-Token': env.STAFF_TOKEN } : {}) }, body: payload });
  return r.json().catch(() => ({ ok: false }));
}

// Footers: students see a plain source label (like the web's "✅ ข้อมูลทางการ"); the engineering trail (route, 0 token,
// rethink, BLAKE3 fingerprint) only when the worker runs with LINE_VIEW=judge (the web's ?view=judge). Staff, 2026-11-03.
const footerFor = (env, student, judge) => (env && env.LINE_VIEW === 'judge') ? judge : student;
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

      // Staff command: "#kb คำถาม | คำตอบ" saves the answer as a KB DRAFT (pending
      // approval) straight from the LINE chat — so a good reply becomes KB with
      // no context switch. The corpus grows from the staff's normal work.
      // (Guarded by LINE_STAFF_USERS if set: comma-separated userIds allowed.)
      if (/^#kb\b/i.test(text)) {
        const allow = String(env.LINE_STAFF_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
        const uid = ev.source?.userId || '';
        if (allow.length && !allow.includes(uid)) {
          await reply(ev.replyToken, 'คำสั่ง #kb ใช้ได้เฉพาะเจ้าหน้าที่ครับ', '', token);
          continue;
        }
        const payload = text.replace(/^#kb\b/i, '').trim();
        const [question, answer] = payload.split('|').map(s => (s || '').trim());
        if (!question || !answer) {
          await reply(ev.replyToken, 'รูปแบบ: #kb คำถาม | คำตอบ\nเช่น: #kb วีซ่านักศึกษาต่างชาติ | ติดต่องานวิเทศสัมพันธ์ เตรียมพาสปอร์ต', '', token);
          continue;
        }
        const r = await saveKbDraft(env, question, answer).catch(() => ({ ok: false }));
        await reply(ev.replyToken, r.ok
          ? `✅ บันทึกเป็น KB draft แล้วครับ (รออนุมัติในแดชบอร์ด)\nคำถาม: ${question}`
          : 'บันทึกไม่สำเร็จครับ ลองใหม่อีกครั้ง', '', token);
        continue;
      }

      // Count the question on the kernel (dashboard totals + audit, and its BLAKE3 proof as tamper-evidence in the judge footer) in
      // parallel: the decision itself is local (the gate the kernel computes is the same sigmoid gate, inside the Router).
      const kernel = routeViaKernel(env, text).catch(() => ({}));
      const today = todayBangkok();
      const d = decideLine(text, today);
      const v = lineView(d, text, { byId: BY_ID, near: () => nearTitles(text), issue: () => classify_issue(text), today });
      // Gap log: the manual could not answer -> the staff backlog (fire-and-forget; a logging failure never blocks the reply)
      if (v.gap) logGapViaKernel(env, text).catch(() => {});
      let answer = v.text, foot = v.footer;
      // Grounded hybrid: an ADVICE question ("แนะนำ/วางแผน/ยังไง") is rephrased by the AI GROUNDED on the matched entries only (facts stay
      // from the manual); the manual text above stays the fallback. Factual questions keep the exact manual answer, 0 token.
      if (v.ai) {
        const near = v.ai.offered.length ? v.ai.offered : [v.ai.entry];
        const bag = { LLM_PROXY, ...(env || {}) };
        // QA F12: question + manual context separately, so the proxy grounds and guards the answer (see askTeam)
        const masked = mask_pii(text);   // only the masked question leaves for the AI; the manual context is ours
        const r = await askTeam(masked, bag, { context: groundedContext(near), prompt: groundedPrompt(masked, near) }).catch(() => ({ ok: false }));
        if (r.ok && r.text) {
          const src = v.ai.entry.source_url ? `\n📎 ${v.ai.entry.source_url}` : '';
          answer = `${r.text}${src}`;
          foot = { student: `🤖 AI ช่วยเรียบเรียงจากคู่มือ · อ้างอิง: ${v.ai.entry.title}`, judge: `🦀 KB-grounded + เรียบเรียงโดย AI · อ้างอิง: ${v.ai.entry.title}` };
        }
      }
      const proof = String((await kernel).blake3_proof || '').slice(0, 16);
      const footer = footerFor(env, foot.student ? `\n\n${foot.student}` : '', `\n\n${foot.judge}${proof ? `\n🔒 ${proof}…` : ''}`);
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
