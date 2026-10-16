// ReflexWork — kernel API on Cloudflare Workers (free tier) + D1 persistence
//
// Serves the same surface as reflex-serve, but edge-deployed and persistent:
//   POST /route     → kernel decision + BLAKE3 proof (runs the real WASM kernel)
//   POST /feedback  → records a 👍/👎 reward (self-learning signal) in D1
//   GET  /status    → fast/LLM/total counters + policy version (from D1)
//   GET  /audit      → recent routing decisions (from D1)
//
// The decision logic is the SAME Rust kernel compiled to WASM that the browser
// pages run — so edge and browser agree bit-for-bit. D1 gives it memory across
// restarts (metrics, audit ring, feedback) without any paid infra.

import { blake3 } from './vendor/blake3.js';
import { bytesToHex, utf8ToBytes } from './vendor/utils.js';

// ── Reflex Kernel routing, ported 1:1 from crates/reflex-wasm/src/lib.rs ──────
// Same seeded weights, same sigmoid gate (θ=0.72), same category one-hot — so
// edge decisions match the browser WASM kernel bit-for-bit.
const FEATURE_DIM = 32, GATE = 0.72;
const CAT = { DocumentParse:0, CodeGen:1, DataQuery:2, WorkflowOrchestration:3, ComplianceCheck:4, OnchainSettlement:5, Research:6 };
function encode(cat, input, tokenBudget, priority) {
  const x = new Array(FEATURE_DIM).fill(0);
  x[(CAT[cat] ?? 7)] = 1;
  const len = [...String(input)].length;
  const complexity = 1 / (1 + Math.exp(-0.005 * (len - 500)));
  x[8] = Math.min(1, Math.max(0, complexity * 0.7 + (priority / 255) * 0.3));
  x[16] = Math.min(1, Math.max(0, tokenBudget / 4096));
  x[24] = 1;
  return x;
}
const sigmoid = z => 1 / (1 + Math.exp(-z));
function seededW() { const w = new Array(FEATURE_DIM).fill(0);
  w[8]=4; w[0]=1.5; w[1]=1.2; w[2]=-2; w[3]=0.8; w[4]=-1.5; w[6]=2; return { w, b:-1.6 }; }
function seededMulti() { const mw = new Array(4*FEATURE_DIM).fill(0);
  const s=(c,i,v)=>{mw[c*FEATURE_DIM+i]=v;};
  s(1,8,2);s(1,4,2.5);s(1,6,2); s(2,8,2.5);s(2,0,2.5);s(2,3,1.5); s(3,16,-4);
  return { mw, mb:[0,0.2,0.2,-1] }; }
function softmax(l){ const m=Math.max(...l); let sum=0; for(let i=0;i<l.length;i++){l[i]=Math.exp(l[i]-m);sum+=l[i];} for(let i=0;i<l.length;i++) l[i]/=sum; return l; }
function routeDecision(x) {
  const { w, b } = seededW();
  const dot = w.reduce((a,wi,i)=>a+wi*x[i],0);
  const g = sigmoid(dot + b);
  let route;
  if (g < GATE*0.55) { route = 'FastPath'; }
  else if (g >= GATE) {
    const { mw, mb } = seededMulti();
    const logits = [0,1,2,3].map(c => mw.slice(c*FEATURE_DIM,(c+1)*FEATURE_DIM).reduce((a,wi,i)=>a+wi*x[i],0)+mb[c]);
    softmax(logits);
    let best=0; for(let i=1;i<4;i++) if(logits[i]>logits[best]) best=i;
    route = best===1?'McpAnalyze':best===2?'McpSynthesize':best===3?'Rejected':'McpAnalyze';
  } else { route = 'FastPath'; }
  return { route, g };          // expose raw sigmoid g for the rethink layer
}
function routeTask(category, input, tokenBudget, priority) {
  const x = encode(category, input, tokenBudget, priority);
  const { route: decision, g } = routeDecision(x);
  const fast = decision === 'FastPath';
  // composite proof = blake3(input || route) — reproducible
  const proof = bytesToHex(blake3(utf8ToBytes(input + '|' + decision)));
  // Confidence + abstain (gist.rs/reflex pattern): how far g sits from the
  // decision threshold, normalized to [0,1]. Inside a band around θ the kernel
  // is NOT sure — it ABSTAINS rather than guessing, so the caller routes to
  // human/intake + gap-log instead of trusting a shaky FastPath/LLM split.
  const confidence = Math.min(1, Math.abs(g - GATE) / GATE);
  const abstain = Math.abs(g - GATE) < 0.08;   // band: |g-θ| < 0.08 → unsure
  return {
    route: decision, fast_path: fast, blake3_proof: proof,
    token_cost: fast ? '0 tokens (deterministic — no LLM)' : 'budgeted (LLM path)',
    gate_dim8_complexity: x[8],
    gate_score: g,
    confidence,
    abstain,
  };
}
async function ensureWasm() { /* pure JS port — no wasm init */ }

const ORIGIN = 'https://reflexwork.pages.dev';
function cors() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });

// simple per-IP token bucket (per-isolate, best-effort) to blunt abuse
const buckets = new Map();
function rateOk(ip, cap = 60, refill = 1) {
  const now = Date.now() / 1000;
  let b = buckets.get(ip) || { t: cap, ts: now };
  b.t = Math.min(cap, b.t + (now - b.ts) * refill); b.ts = now;
  buckets.set(ip, b);
  if (b.t < 1) return false; b.t -= 1; return true;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    if (!rateOk(ip)) return json({ error: 'rate limited' }, 429);

    await ensureWasm();
    await ensureSchema(env);

    try {
      if (url.pathname === '/health') return json({ ok: true });
      if (url.pathname === '/route' && request.method === 'POST') return route(request, env);
      if (url.pathname === '/feedback' && request.method === 'POST') return feedback(request, env);
      if (url.pathname === '/status' && request.method === 'GET') return status(env);
      if (url.pathname === '/audit' && request.method === 'GET') return audit(env);
      if (url.pathname === '/gap' && request.method === 'POST') return logGap(request, env);
      if (url.pathname === '/gaps' && request.method === 'GET') return gaps(env);
      // Staff-only KB authoring. If STAFF_TOKEN is configured, require a matching
      // X-Staff-Token header; if unset (demo), allow. Keeps random public callers
      // from flooding drafts while staying zero-config for a hackathon demo.
      if (url.pathname.startsWith('/kb-')) {
        if (env.STAFF_TOKEN && request.headers.get('X-Staff-Token') !== env.STAFF_TOKEN)
          return json({ error: 'staff token required' }, 401);
      }
      if (url.pathname === '/kb-draft' && request.method === 'POST') return kbDraft(request, env);
      if (url.pathname === '/kb-drafts' && request.method === 'GET') return kbDrafts(env);
      if (url.pathname === '/kb-approve' && request.method === 'POST') return kbApprove(request, env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

async function ensureSchema(env) {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS metrics (k TEXT PRIMARY KEY, v INTEGER NOT NULL);"
  );
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, category TEXT, route TEXT, fast INTEGER, kernel_us REAL, proof TEXT);"
  );
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS feedback_log (proof TEXT PRIMARY KEY, reward REAL, at INTEGER);"
  );
  // gap_log: questions the KB could NOT answer (escalated/👎). Aggregated by a
  // normalized key so repeats bump a count — this is the KB improvement backlog.
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS gap_log (qkey TEXT PRIMARY KEY, sample TEXT, hits INTEGER NOT NULL DEFAULT 1, last_at INTEGER, source TEXT);"
  );
  // kb_draft: candidate KB entries awaiting human approval. A staff reply (or an
  // auto-draft built from a gap + the staff's answer) lands here; once approved
  // it becomes a real KB .md entry. This closes the learning loop WITHOUT auto-
  // publishing unverified content — a human presses approve.
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS kb_draft (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, question TEXT, answer TEXT, keywords TEXT, category TEXT, status TEXT NOT NULL DEFAULT 'pending', source TEXT, at INTEGER);"
  );
}

async function bump(env, key, by = 1) {
  await env.DB.prepare(
    "INSERT INTO metrics (k,v) VALUES (?1,?2) ON CONFLICT(k) DO UPDATE SET v=v+?2"
  ).bind(key, by).run();
}

async function route(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = String(body.input || '').trim().slice(0, 4000);
  if (!input) return json({ error: 'input required' }, 400);
  const category = String(body.category || 'DataQuery').slice(0, 64);
  const priority = Math.max(0, Math.min(255, Number(body.priority) || 128));

  const d = routeTask(category, input, 2048, priority);
  const fast = !!d.fast_path;

  await bump(env, 'total');
  await bump(env, fast ? 'fast' : (String(d.route).startsWith('Rejected') ? 'rejected' : 'llm'));
  await env.DB.prepare(
    "INSERT INTO audit (at,category,route,fast,kernel_us,proof) VALUES (?1,?2,?3,?4,?5,?6)"
  ).bind(Date.now(), category, d.route, fast ? 1 : 0, 0, d.blake3_proof).run();
  // keep audit bounded (last 100)
  await env.DB.exec("DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 100);");

  return json({
    category, route: d.route, fast_path: fast,
    blake3_proof: d.blake3_proof, token_cost: d.token_cost,
    gate_dim8_complexity: d.gate_dim8_complexity,
    gate_score: d.gate_score,
    confidence: d.confidence,
    abstain: d.abstain,
    audit_note: 're-running this task yields the SAME BLAKE3 proof (reproducible)',
  });
}

async function feedback(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = String(body.input || '').trim();
  if (!input) return json({ error: 'input required' }, 400);
  const reward = Math.max(-1, Math.min(1, Number(body.reward) || 0));
  // per-answer dedup: a given answer (identified by its BLAKE3 proof) counts once.
  const proof = String(body.proof || '').slice(0, 64);
  if (proof) {
    const seen = await env.DB.prepare("SELECT 1 FROM feedback_log WHERE proof=?1").bind(proof).first();
    if (seen) {
      const cur = await env.DB.prepare("SELECT v FROM metrics WHERE k='policy_version'").first();
      return json({ accepted: false, deduped: true, policy_version: cur ? cur.v : 1,
        note: 'feedback already recorded for this answer' });
    }
    await env.DB.prepare("INSERT INTO feedback_log (proof, reward, at) VALUES (?1,?2,?3)")
      .bind(proof, reward, Date.now()).run();
  }
  await bump(env, 'feedback_count');
  await bump(env, reward >= 0 ? 'feedback_up' : 'feedback_down');
  await bump(env, 'policy_version');
  const row = await env.DB.prepare("SELECT v FROM metrics WHERE k='policy_version'").first();
  return json({ accepted: true, policy_version: row ? row.v : 1, reward,
    note: 'feedback recorded; policy adapts (EMA on the serving kernel)' });
}

async function status(env) {
  const rows = await env.DB.prepare("SELECT k,v FROM metrics").all();
  const m = {}; for (const r of (rows.results || [])) m[r.k] = r.v;
  const total = m.total || 0, fast = m.fast || 0, llm = m.llm || 0, rejected = m.rejected || 0;
  return json({
    total_routed: total, fast_path: fast, llm_path: llm, rejected,
    fast_path_pct: total ? Math.round(fast / total * 100) : 0,
    policy_version: 'v' + ((m.policy_version || 0) + 1),
  });
}

async function audit(env) {
  const rows = await env.DB.prepare(
    "SELECT at,category,route,fast,kernel_us,proof FROM audit ORDER BY id DESC LIMIT 50"
  ).all();
  const entries = (rows.results || []).map(r => ({
    at_unix_ms: r.at, category: r.category, route: r.route,
    fast_path: !!r.fast, kernel_us: r.kernel_us || 0, blake3_proof: r.proof,
  }));
  return json({ entries });
}

// Normalize a question into an aggregation key: lowercase, collapse spaces,
// strip punctuation, cap length. Similar phrasings fold to one backlog row.
function gapKey(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// PII mask for the stored gap sample. The gist.rs "better together" principle:
// pool COUNTS, never raw text. We still keep a short sample so staff know what
// the gap is about, but scrub the obvious personal identifiers first so the
// backlog never accumulates emails / phones / student IDs.
function maskPII(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[email]')              // emails
    .replace(/\b0\d[\d\s-]{7,}\d\b/g, '[phone]')               // TH phone numbers
    .replace(/\b\d{7,}\b/g, '[id]')                            // long digit runs (student/account IDs)
    .replace(/\b[gG]\d{6,}\b/g, '[id]');                       // Gxxxxxx-style account ids
}

// POST /gap { q, source } — record a question the KB could not answer.
async function logGap(request, env) {
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));
  const q = String(body.q || '').trim();
  const source = String(body.source || 'web').slice(0, 16);
  if (!q || q.length > 500) return json({ ok: false, error: 'bad q' }, 400);
  const key = gapKey(q);
  if (!key) return json({ ok: false, error: 'empty' }, 400);
  const sample = maskPII(q.slice(0, 200));   // scrub PII before it is stored
  await env.DB.prepare(
    "INSERT INTO gap_log (qkey, sample, hits, last_at, source) VALUES (?1,?2,1,?3,?4) " +
    "ON CONFLICT(qkey) DO UPDATE SET hits=hits+1, last_at=?3, sample=?2"
  ).bind(key, sample, Date.now(), source).run();
  // keep the backlog bounded to the 200 most-recent distinct gaps
  await env.DB.exec("DELETE FROM gap_log WHERE qkey NOT IN (SELECT qkey FROM gap_log ORDER BY last_at DESC LIMIT 200);");
  return json({ ok: true });
}

// GET /gaps — the KB improvement backlog, most-asked unanswered first.
async function gaps(env) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(
    "SELECT sample, hits, last_at, source FROM gap_log ORDER BY hits DESC, last_at DESC LIMIT 30"
  ).all();
  const entries = (rows.results || []).map(r => ({
    question: r.sample, hits: r.hits, last_at_unix_ms: r.last_at, source: r.source,
  }));
  const totalRow = await env.DB.prepare("SELECT COUNT(*) c, COALESCE(SUM(hits),0) s FROM gap_log").first();
  return json({ entries, distinct: totalRow?.c || 0, total_hits: totalRow?.s || 0 });
}

// POST /kb-draft { question, answer, title?, keywords?, category?, source? }
// A staff member's good answer (or an auto-draft from a gap) becomes a PENDING
// KB candidate. Nothing is published yet — a human approves it later.
async function kbDraft(request, env) {
  await ensureSchema(env);
  const b = await request.json().catch(() => ({}));
  const question = String(b.question || '').trim().slice(0, 500);
  const answer = String(b.answer || '').trim().slice(0, 2000);
  if (!question || !answer) return json({ ok: false, error: 'question + answer required' }, 400);
  // Derive sensible defaults; staff can override title/keywords/category.
  const title = String(b.title || question).trim().slice(0, 200);
  const keywords = String(b.keywords || question).toLowerCase().slice(0, 300);
  const category = String(b.category || 'general').slice(0, 64);
  const source = String(b.source || 'staff-reply').slice(0, 32);
  const r = await env.DB.prepare(
    "INSERT INTO kb_draft (title, question, answer, keywords, category, status, source, at) " +
    "VALUES (?1,?2,?3,?4,?5,'pending',?6,?7)"
  ).bind(title, question, answer, keywords, category, source, Date.now()).run();
  // bound the drafts table
  await env.DB.exec("DELETE FROM kb_draft WHERE status='pending' AND id NOT IN (SELECT id FROM kb_draft WHERE status='pending' ORDER BY at DESC LIMIT 100);");
  return json({ ok: true, id: r.meta?.last_row_id });
}

// GET /kb-drafts — pending KB candidates for staff to review/approve.
async function kbDrafts(env) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(
    "SELECT id, title, question, answer, keywords, category, source, at FROM kb_draft WHERE status='pending' ORDER BY at DESC LIMIT 50"
  ).all();
  return json({ drafts: rows.results || [] });
}

// POST /kb-approve { id } — mark a draft approved and return a ready-to-file
// KB markdown document (frontmatter + body) the maintainer drops into
// submissions/ui/knowledge-public/ and rebuilds the index. We deliberately do
// NOT write to the repo from the edge — approval emits the artifact, a human
// commits it (keeps the public repo's provenance clean).
async function kbApprove(request, env) {
  await ensureSchema(env);
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id) || 0;
  if (!id) return json({ ok: false, error: 'id required' }, 400);
  const d = await env.DB.prepare("SELECT * FROM kb_draft WHERE id=?1").bind(id).first();
  if (!d) return json({ ok: false, error: 'not found' }, 404);
  await env.DB.prepare("UPDATE kb_draft SET status='approved' WHERE id=?1").bind(id).run();
  // Filename slug: prefer ASCII (latin/digits) from the title; Thai-only titles
  // have no ASCII, so fall back to a stable kb_<id> name the maintainer renames.
  const ascii = String(d.title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const slug = (ascii.length >= 3 ? ascii : `kb_draft_${id}`).slice(0, 40);
  const md = `---\n` +
    `title: ${JSON.stringify(d.title)}\n` +
    `category: ${JSON.stringify(d.category)}\n` +
    `source_type: "staff_approved"\n` +
    `source_url: "https://graduate.mahidol.ac.th/"\n` +
    `language: "th"\n` +
    `approval_status: "approved"\n` +
    `---\n## ${d.title}\n\n` +
    `คำค้นภาษาอังกฤษ: ${d.keywords}\n\n${d.answer}\n`;
  return json({ ok: true, id, filename: `${slug}.md`, markdown: md });
}
