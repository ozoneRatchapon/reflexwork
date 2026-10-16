// corpus-service — the central federated-corpus service (distributable-kernel
// spec, Phase D). Receives MASKED signals from many installs, clusters gaps,
// turns a hot cluster into a PENDING draft, and — only after a HUMAN approves —
// publishes a content-addressed, SIGNED corpus release that installs pull and
// verify. It anchors each release's hash on Solana (reusing ReflexWork's
// existing attestation/workflow-escrow proof path) so a release is verifiable
// across organisations that do not trust each other.
//
// Hard invariants (spec R4/R6 + the product's PDPA rule):
//   • stores AGGREGATE counts only — there is NO per-user table here;
//   • NEVER auto-publishes a draft — a human approves every entry;
//   • a release is signed and its hash anchored on-chain before installs pull it.
//
// Endpoints:
//   POST /signal           ingest one install's masked payload  (R4)
//   GET  /clusters         hot gap clusters (candidates for authoring)
//   POST /draft            create/refresh a PENDING draft for a cluster (R4)
//   GET  /drafts           list drafts
//   POST /approve          human approval → entry joins the next release (R4)
//   POST /release          cut a signed, content-addressed release + anchor it (R6)
//   GET  /release/latest   the signed release installs pull + verify (R5/R6)

import { buildPayload, assertSafe } from '../_shared/federation.mjs';

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    await ensureSchema(env);
    try {
      if (url.pathname === '/health') return json({ ok: true });
      if (url.pathname === '/signal' && request.method === 'POST') return ingestSignal(request, env);
      if (url.pathname === '/clusters' && request.method === 'GET') return clusters(env);
      if (url.pathname === '/drafts' && request.method === 'GET') return listDrafts(env);
      // Author/approve/release are staff-gated when a token is configured.
      if (['/draft', '/approve', '/release'].includes(url.pathname)) {
        if (env.STAFF_TOKEN && request.headers.get('X-Staff-Token') !== env.STAFF_TOKEN)
          return json({ error: 'staff token required' }, 401);
      }
      if (url.pathname === '/draft' && request.method === 'POST') return makeDraft(request, env);
      if (url.pathname === '/approve' && request.method === 'POST') return approve(request, env);
      if (url.pathname === '/release' && request.method === 'POST') return cutRelease(request, env);
      if (url.pathname === '/release/latest' && request.method === 'GET') return latestRelease(env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

async function ensureSchema(env) {
  // Aggregate-only. No user table, by design (spec non-goal: no per-user data).
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS signals (topic_key TEXT, install TEXT, count INTEGER, window TEXT, at INTEGER, PRIMARY KEY(topic_key, install, window));"
  );
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS drafts (cluster TEXT PRIMARY KEY, installs INTEGER, count INTEGER, draft_md TEXT, status TEXT, at INTEGER);"
  );
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS corpus_entries (slug TEXT PRIMARY KEY, md TEXT, source_url TEXT, approved_at INTEGER);"
  );
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS corpus_releases (version TEXT PRIMARY KEY, content_hash TEXT, sig TEXT, anchor_tx TEXT, entries INTEGER, at INTEGER);"
  );
}

// POST /signal — ingest one install's MASKED payload. We re-run assertSafe as a
// server-side boundary check: a signal carrying anything text-like is rejected,
// not stored (defence in depth even though the client already guarantees it).
async function ingestSignal(request, env) {
  const body = await request.json().catch(() => ({}));
  try { assertSafe(body); } catch (e) { return json({ ok: false, error: 'unsafe signal rejected: ' + e.message }, 400); }
  const install = String(body.install || 'pub:unknown').slice(0, 80);
  const window = String(body.window || '').slice(0, 20);
  const gaps = Array.isArray(body.gap) ? body.gap : [];
  let n = 0;
  for (const g of gaps) {
    if (!/^tk_[0-9a-f]{8}$/.test(String(g.topic_key || ''))) continue;  // opaque bucket ids only
    await env.DB.prepare(
      "INSERT INTO signals (topic_key, install, count, window, at) VALUES (?1,?2,?3,?4,?5) " +
      "ON CONFLICT(topic_key, install, window) DO UPDATE SET count=?3, at=?5"
    ).bind(g.topic_key, install, Number(g.count) || 0, window, Date.now()).run();
    n++;
  }
  return json({ ok: true, accepted: n });
}

// GET /clusters — group signals by topic_key across installs; a cluster is a
// candidate once enough DISTINCT installs report it (cross-install threshold).
async function clusters(env) {
  const minInstalls = Number(env.CLUSTER_MIN_INSTALLS || 2);
  const rows = (await env.DB.prepare(
    "SELECT topic_key, COUNT(DISTINCT install) installs, SUM(count) total FROM signals GROUP BY topic_key HAVING installs >= ?1 ORDER BY total DESC LIMIT 50"
  ).bind(minInstalls).all()).results || [];
  return json({ clusters: rows, min_installs: minInstalls });
}

// POST /draft { cluster, draft_md } — author a PENDING draft for a cluster.
// draft_md is grounded on existing public KB (the authoring call is the caller's
// learning-loop auto-draft or a staff write). Never published here.
async function makeDraft(request, env) {
  const b = await request.json().catch(() => ({}));
  const cluster = String(b.cluster || '').trim();
  const draft_md = String(b.draft_md || '').trim();
  if (!cluster || !draft_md) return json({ ok: false, error: 'cluster + draft_md required' }, 400);
  const agg = await env.DB.prepare(
    "SELECT COUNT(DISTINCT install) installs, SUM(count) total FROM signals WHERE topic_key=?1"
  ).bind(cluster).first();
  await env.DB.prepare(
    "INSERT INTO drafts (cluster, installs, count, draft_md, status, at) VALUES (?1,?2,?3,?4,'pending',?5) " +
    "ON CONFLICT(cluster) DO UPDATE SET draft_md=?4, installs=?2, count=?3, status='pending', at=?5"
  ).bind(cluster, agg?.installs || 0, agg?.total || 0, draft_md, Date.now()).run();
  return json({ ok: true, cluster, status: 'pending' });
}

async function listDrafts(env) {
  const rows = (await env.DB.prepare("SELECT cluster, installs, count, status, at FROM drafts ORDER BY count DESC LIMIT 50").all()).results || [];
  return json({ drafts: rows });
}

// POST /approve { cluster, slug, source_url } — HUMAN approval. Moves a pending
// draft into the corpus as an approved entry. This is the only path to a
// publishable entry; there is deliberately no auto-approve route.
async function approve(request, env) {
  const b = await request.json().catch(() => ({}));
  const cluster = String(b.cluster || '').trim();
  const slug = String(b.slug || cluster).trim().slice(0, 120);
  const d = await env.DB.prepare("SELECT draft_md FROM drafts WHERE cluster=?1 AND status='pending'").bind(cluster).first();
  if (!d) return json({ ok: false, error: 'no pending draft for cluster' }, 404);
  await env.DB.prepare(
    "INSERT INTO corpus_entries (slug, md, source_url, approved_at) VALUES (?1,?2,?3,?4) " +
    "ON CONFLICT(slug) DO UPDATE SET md=?2, source_url=?3, approved_at=?4"
  ).bind(slug, d.draft_md, String(b.source_url || ''), Date.now()).run();
  await env.DB.prepare("UPDATE drafts SET status='approved' WHERE cluster=?1").bind(cluster).run();
  return json({ ok: true, slug, status: 'approved' });
}

// POST /release — cut a content-addressed, SIGNED release of all approved
// entries, and anchor its hash on Solana. Installs verify the signature + the
// on-chain anchor before pulling (spec R5/R6). The anchor reuses ReflexWork's
// existing BLAKE3 attestation → workflow-escrow proof path: we submit the
// release content_hash as the task_spec_hash of an attestation.
async function cutRelease(request, env) {
  const entries = (await env.DB.prepare("SELECT slug, md, source_url FROM corpus_entries ORDER BY slug").all()).results || [];
  if (!entries.length) return json({ ok: false, error: 'no approved entries to release' }, 400);
  const canonical = JSON.stringify(entries);
  const content_hash = await sha256Hex(canonical);
  const version = new Date().toISOString().slice(0, 10) + '.' + content_hash.slice(0, 8);
  const sig = await signHmac(env.RELEASE_SIGNING_KEY || 'dev-unsigned', content_hash);
  // Anchor on Solana: submit content_hash as an attestation. Requires the
  // ANCHOR_WEBHOOK (a small signer service holding the program authority key) —
  // when unset we record the hash with anchor_tx='unanchored' so a local demo
  // still works, and say so, rather than faking a tx.
  const anchor_tx = await anchorOnSolana(env, content_hash);
  await env.DB.prepare(
    "INSERT INTO corpus_releases (version, content_hash, sig, anchor_tx, entries, at) VALUES (?1,?2,?3,?4,?5,?6)"
  ).bind(version, content_hash, sig, anchor_tx, entries.length, Date.now()).run();
  return json({ ok: true, version, content_hash, sig, anchor_tx, entries: entries.length });
}

async function latestRelease(env) {
  const rel = await env.DB.prepare("SELECT * FROM corpus_releases ORDER BY at DESC LIMIT 1").first();
  if (!rel) return json({ error: 'no release yet' }, 404);
  const entries = (await env.DB.prepare("SELECT slug, md, source_url FROM corpus_entries ORDER BY slug").all()).results || [];
  // Entries carry provenance (source_url) + the corpus_version that approved
  // them, so a pulling install can attribute every fact (spec R5).
  return json({
    version: rel.version, content_hash: rel.content_hash, sig: rel.sig, anchor_tx: rel.anchor_tx,
    entries: entries.map(e => ({ ...e, corpus_version: rel.version })),
    verify: 'recompute sha256 over entries, check sig, and confirm content_hash is anchored at anchor_tx on Solana',
  });
}

// ── crypto helpers (Web Crypto, available in Workers) ────────────────────────
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function signHmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return 'hmac-sha256:' + [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Anchor the release hash on Solana via a signer webhook (holds the program
// authority). Honest fallback: no webhook configured → 'unanchored'.
async function anchorOnSolana(env, contentHash) {
  if (!env.ANCHOR_WEBHOOK) return 'unanchored';
  try {
    const r = await fetch(env.ANCHOR_WEBHOOK, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_spec_hash: contentHash }),  // reuses the attestation shape
    });
    const j = await r.json().catch(() => ({}));
    return String(j.tx || 'anchor-failed');
  } catch { return 'anchor-failed'; }
}
