#!/usr/bin/env node
// Local stand-in for the production backend, for recording the staff-loop demo WITHOUT writing to the real kernel.
// Serves submissions/ui (the same pages that are deployed) on PORT and an in-memory kernel on PORT+1 with the endpoints the chat and the
// dashboard use: /gap /gaps /kb-draft /kb-drafts /kb-approve /kb-retract /live-kb /status /audit /entry-conf, plus /rewrite and /llm
// (the AI proxy answers 503, so the page shows manual text only - same as ?ai=off). State lives in memory and is lost on exit.
//   node scripts/demo_mock_server.mjs [port=8787] [git ref, e.g. origin/feature/qa-round1-fixes = the pages production was deployed from]
//   chat:      http://127.0.0.1:8787/chatbot.html?view=judge&api=http://127.0.0.1:8788&llm=http://127.0.0.1:8788
//   dashboard: http://127.0.0.1:8787/dashboard.html   (then set the API box to http://127.0.0.1:8788)
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

// ref: serve submissions/ui as committed at a git ref (e.g. the branch production was deployed from) instead of the working tree,
// so a recording shows exactly the deployed pages even while someone edits the files locally.
const ROOT = join(UI, '..', '..');
function git_file(ref, rel) {
  const r = spawnSync('git', ['--no-pager', 'show', `${ref}:submissions/ui/${rel}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
export function start_demo_servers(port = 8787, ref = '') {
  if (ref && spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: ROOT }).status !== 0) throw new Error(`unknown git ref: ${ref}`);
  const stat = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/chatbot.html';
    const f = normalize(join(UI, p)); if (!f.startsWith(UI)) { res.writeHead(404); return res.end(); }
    let rel = f.slice(UI.length + 1);
    // build outputs that git does not track (knowledge-index.json, wasm/) come from the working tree in both modes
    const disk = r => existsSync(join(UI, r)) ? readFileSync(join(UI, r)) : null;
    const read = r => ref ? (git_file(ref, r) ?? disk(r)) : disk(r);
    let body = read(rel);
    if (!body && !extname(rel)) { rel += '.html'; body = read(rel); }   // /chatbot -> chatbot.html, as Pages does
    if (!body) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  });
  const S = { gaps: new Map(), drafts: [], next_id: 1, routed: 0 };
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Staff-Token', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const kernel = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const u = new URL(req.url, 'http://x').pathname, body = (() => { try { return JSON.parse(b || '{}'); } catch { return {}; } })();
      const out = (o, code = 200) => { res.writeHead(code, h); res.end(JSON.stringify(o)); };
      const live = () => S.drafts.filter(d => d.status === 'live');
      switch (u) {
        case '/gap': { const q = String(body.q || '').trim(); if (q) { const g = S.gaps.get(q) || { question: q, hits: 0, source: body.source || 'web' }; g.hits++; g.last_at_unix_ms = Date.now(); S.gaps.set(q, g); } return out({ ok: true }); }
        case '/gaps': return out({ entries: [...S.gaps.values()].sort((a, c) => c.hits - a.hits) });
        case '/kb-draft': { const d = { id: S.next_id++, title: String(body.question || ''), question: String(body.question || ''), answer: String(body.answer || ''), status: 'pending', source: body.source || 'dashboard', at: Date.now() }; S.drafts.push(d); return out({ ok: true, id: d.id }); }
        case '/kb-drafts': return out({ drafts: S.drafts.filter(d => d.status === 'pending') });
        case '/kb-approve': { const d = S.drafts.find(x => x.id === Number(body.id)); if (!d) return out({ ok: false, error: 'not found' }, 404);
          d.status = 'live'; d.approved_at = Date.now(); d.approved_by = String(body.by || ''); S.gaps.delete(d.question);
          return out({ ok: true, id: d.id, filename: `kb_draft_${d.id}.md`, markdown: `---\ntitle: ${JSON.stringify(d.title)}\nsource_type: "staff_approved"\n---\n## ${d.title}\n\n${d.answer}\n` }); }
        case '/kb-retract': { const d = S.drafts.find(x => x.id === Number(body.id) && x.status === 'live'); if (d) d.status = 'retracted'; return out({ ok: !!d }); }
        case '/live-kb': return out({ entries: live().map(({ id, title, question, answer, approved_at }) => ({ id, title, question, answer, approved_at })) });
        case '/status': return out({ total_routed: S.routed, fast_path: S.routed, fast_path_pct: S.routed ? 100 : 0, llm_path: 0, rejected: 0, policy_version: 1 });
        case '/audit': return out({ entries: [] });
        case '/entry-conf': return out({ entries: [] });
        case '/rewrite': return out({ queries: [], source: 'none' });
        case '/llm': return out({ error: 'AI is off in the local demo' }, 503);
        default: S.routed++; return out({});
      }
    });
  });
  return new Promise(r => stat.listen(port, '127.0.0.1', () => kernel.listen(port + 1, '127.0.0.1', () => r({ stat, kernel, state: S, port }))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8787), ref = process.argv[3] || '';
  await start_demo_servers(port, ref);
  if (ref) console.log(`pages from git ${ref} (not the working tree)`);
  console.log(`page   http://127.0.0.1:${port}/chatbot.html?view=judge&api=http://127.0.0.1:${port + 1}&llm=http://127.0.0.1:${port + 1}`);
  console.log(`staff  http://127.0.0.1:${port}/dashboard.html  (API box: http://127.0.0.1:${port + 1})`);
}
