// Shared HTTP helpers for the ReflexWork Cloudflare Workers.
// Removes the CORS + rate-limit + json duplication between kernel-worker and
// llm-proxy. Imported with a relative path; each worker still deploys on its own.

const DEFAULT_ORIGIN = 'https://reflexwork.pages.dev';

export function corsHeaders(origin = DEFAULT_ORIGIN) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', ...headers },
  });
}

// Per-isolate token bucket. Best-effort (not shared across isolates); use a
// Durable Object or KV for a strict global limit in production.
const buckets = new Map();
export function rateOk(ip, cap = 60, refillPerSec = 1) {
  const now = Date.now() / 1000;
  let b = buckets.get(ip);
  if (!b) { b = { tokens: cap, ts: now }; buckets.set(ip, b); }
  b.tokens = Math.min(cap, b.tokens + (now - b.ts) * refillPerSec);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
