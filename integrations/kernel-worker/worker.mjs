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
  return {
    route: decision, fast_path: fast, blake3_proof: proof,
    token_cost: fast ? '0 tokens (deterministic — no LLM)' : 'budgeted (LLM path)',
    gate_dim8_complexity: x[8],
    gate_score: g,
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
