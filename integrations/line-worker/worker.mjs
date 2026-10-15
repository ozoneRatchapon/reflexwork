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

const KERNEL = 'https://reflexwork-kernel.solana-thailand.workers.dev';
const LLM_PROXY = 'https://reflexwork-llm-proxy.solana-thailand.workers.dev';

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

async function reply(replyToken, text, decision, token) {
  const footer = `\n\n🦀 ${decision.route} · ${decision.fast_path ? '0 token' : 'LLM'}`
               + `\n🔒 ${String(decision.blake3_proof).slice(0, 16)}…`;
  if (!token) return; // PoC: no credentials → skip actual LINE call
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text + footer }] }),
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
        const decision = await routeViaKernel(env, text);
        const answer = decision.fast_path
          ? 'พบคำตอบในคู่มือ — ตอบทันที ไม่เรียก AI (เสียบ KB ของทีมตรงนี้)'
          : await answerLLM(text);
        await reply(ev.replyToken, answer, decision, token);
      }
    } catch (e) {
      // never 500 a webhook — LINE retries aggressively. Log and ack.
      console.log('line handler error:', String(e && e.message || e));
    }
    return new Response('ok');
  },
};
