// federation.mjs — the opt-in signal layer (distributable-kernel spec, Phase C).
//
// This is the ONLY code path by which anything leaves an install, and it is
// designed so raw user text CANNOT. It reads the ALREADY-MASKED, ALREADY-
// AGGREGATED tables the learning loop maintains (gap_log, entry_conf, counters)
// and derives three signal types:
//
//   gap   { topic_key, count }     — a coarse topic bucket + how often, NO text
//   conf  { entry_hash, delta }    — a KB entry content hash + its confidence drift
//   route { fast_path, llm, abstain } — route distribution counts for a window
//
// Hard guarantees (spec R3/R6):
//   • never emits raw question text, a user id, or a mask-flagged field;
//   • k-anonymity: a gap bucket below K distinct-hit threshold is DROPPED;
//   • dry-run first: buildPayload() is pure; nothing is sent by this module.
//
// Disabled by default: an install ships with federation.enabled=false and no
// endpoint, so this never runs until the maintainer opts in (R2/R3).

/** k-anonymity floor: a gap bucket with fewer than this many hits is not shared. */
export const K_ANON_MIN_HITS = 5;

/** Max distinct gap buckets per payload (cardinality cap — re-identification guard). */
export const MAX_GAP_BUCKETS = 50;

// A topic_key is a COARSE bucket, deliberately lossy so it cannot carry back a
// specific question. We take the already-normalized gap key (lowercased, punct-
// stripped, <=80 chars), keep only word-ish tokens >= 3 chars, sort+dedupe them,
// and keep at most the first few — then hash to a short, stable, non-reversible
// bucket id. Two different phrasings of the same topic collapse to one bucket;
// a unique phrasing cannot be reconstructed from the id.
export function topicKey(normalizedGapKey) {
  const toks = String(normalizedGapKey || '')
    .split(/\s+/)
    .filter(t => t.length >= 3)
    .sort();
  const uniq = [...new Set(toks)].slice(0, 4);
  if (!uniq.length) return null;
  return 'tk_' + fnv1a(uniq.join(' ')).toString(16).padStart(8, '0');
}

/**
 * Build gap signals from gap_log rows. Each row is the ALREADY-MASKED aggregate
 * the learning loop stores: { qkey, hits }. We bucket by topicKey, sum hits,
 * then drop any bucket under the k-anonymity floor. Raw samples are never read.
 * @param {{qkey:string, hits:number}[]} gapRows
 * @returns {{topic_key:string, count:number}[]}
 */
export function buildGapSignals(gapRows) {
  const buckets = new Map();
  for (const r of gapRows || []) {
    const tk = topicKey(r.qkey);
    if (!tk) continue;
    buckets.set(tk, (buckets.get(tk) || 0) + (Number(r.hits) || 0));
  }
  return [...buckets.entries()]
    .filter(([, count]) => count >= K_ANON_MIN_HITS)   // k-anonymity guard
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_GAP_BUCKETS)
    .map(([topic_key, count]) => ({ topic_key, count }));
}

/**
 * Build confidence signals from entry_conf rows. Keyed by a content hash of the
 * KB entry (never its text), carrying the signed drift from the neutral 0.5.
 * @param {{entry_hash:string, conf:number}[]} confRows
 * @returns {{entry_hash:string, delta:number}[]}
 */
export function buildConfSignals(confRows) {
  return (confRows || [])
    .filter(r => r && r.entry_hash && typeof r.conf === 'number')
    .map(r => ({ entry_hash: String(r.entry_hash), delta: round3(r.conf - 0.5) }));
}

/**
 * Build the route-distribution signal from plain counters.
 * @param {{fast_path?:number, llm?:number, abstain?:number}} counts
 */
export function buildRouteSignal(counts = {}) {
  return {
    fast_path: Number(counts.fast_path) || 0,
    llm: Number(counts.llm) || 0,
    abstain: Number(counts.abstain) || 0,
  };
}

/**
 * Assemble the full outbound payload. PURE — it sends nothing. The worker calls
 * this and either prints it (dry-run / `federation preview`) or, only when the
 * maintainer has opted in, POSTs it.
 * @param {object} args
 * @param {string} args.installId     the install's public-key id (e.g. 'pub:ab12…')
 * @param {string} args.window        the window label, e.g. an ISO date
 * @param {{qkey:string,hits:number}[]} args.gapRows
 * @param {{entry_hash:string,conf:number}[]} args.confRows
 * @param {object} args.routeCounts
 */
export function buildPayload({ installId, window, gapRows, confRows, routeCounts }) {
  const payload = {
    install: String(installId || 'pub:unknown'),
    window: String(window || ''),
    gap: buildGapSignals(gapRows),
    conf: buildConfSignals(confRows),
    route: buildRouteSignal(routeCounts),
  };
  // Defence in depth: assert no forbidden field slipped in before it can leave.
  assertSafe(payload);
  return payload;
}

/**
 * Throws if the payload contains anything that must never leave the machine.
 * This is the enforced version of the spec's privacy contract (R3/R6): the
 * builder can only ever produce the allowed shapes, and this double-checks it.
 */
export function assertSafe(payload) {
  const FORBIDDEN = /sample|question|text|email|phone|name|student|user|ip\b|raw/i;
  const walk = (obj, pathStr = '') => {
    if (obj == null) return;
    if (Array.isArray(obj)) return obj.forEach((v, i) => walk(v, `${pathStr}[${i}]`));
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (FORBIDDEN.test(k)) throw new Error(`federation: forbidden field '${k}' at ${pathStr}`);
        walk(v, pathStr ? `${pathStr}.${k}` : k);
      }
      return;
    }
    // topic_key / entry_hash / install ids are opaque; a long free-text string
    // in a value position is a red flag for an accidental raw-text leak.
    if (typeof obj === 'string' && obj.length > 120) {
      throw new Error(`federation: suspiciously long string value at ${pathStr}`);
    }
  };
  walk(payload);
  return true;
}

// ── helpers ────────────────────────────────────────────────────────────────
function fnv1a(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function round3(n) { return Math.round(n * 1000) / 1000; }
