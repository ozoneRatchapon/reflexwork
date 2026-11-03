#!/usr/bin/env node
// Local CORS forwarder so a page served from 127.0.0.1 can reach an LLM proxy (the proxies only allow the site's origin).
// Defaults to the TEST proxy (reflexwork-llm-proxy-dev, its own Gemini key). The production proxy needs --prod, on purpose:
// AI-heavy benchmark runs on 2026-11-03 exhausted the live site's quota.
//   node scripts/llm_forward.mjs [--port 8793] [--prod]
//   then open the page with ?llm=http://127.0.0.1:8793
import http from 'node:http';
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const PROD = 'https://reflexwork-llm-proxy.solana-thailand.workers.dev', DEV = 'https://reflexwork-llm-proxy-dev.solana-thailand.workers.dev';
const target = process.argv.includes('--prod') ? PROD : DEV, port = Number(arg('--port') || 8793);
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', async () => {
  if (q.method === 'OPTIONS') { r.writeHead(204, H); return r.end(); }
  try { const u = await fetch(target + q.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://reflexwork.pages.dev' }, body: b });
    r.writeHead(u.status, H); r.end(await u.text()); } catch { r.writeHead(502, H); r.end('{}'); } }); })
  .listen(port, '127.0.0.1', () => console.log(`forwarding http://127.0.0.1:${port} -> ${target}${target === PROD ? '  (PRODUCTION quota!)' : ''}`));
