// Phase G — two-install federated-corpus demo (distributable-kernel spec).
//
// Walks the whole loop with NO infra: install A has a repeated gap → emits a
// MASKED signal → the central service clusters it, drafts an answer, a HUMAN
// approves, a SIGNED release is cut → install B pulls it and VERIFIES the
// signature. Proves the loop closes and that no raw text ever crosses.
//
// Run: node demo/federated-corpus-demo.mjs   (exit 0 = the loop closed cleanly)
//
// It drives the REAL shared logic (integrations/_shared/federation.mjs) against
// a tiny in-memory stand-in for the corpus-service's D1 tables, so the signal
// shapes, k-anonymity guard, and safety assertions are the production ones.
import { buildPayload, assertSafe } from '../integrations/_shared/federation.mjs';
import { createHash, createHmac } from 'node:crypto';

const log = (...a) => console.log(...a);
let failures = 0;
const check = (cond, msg) => { log((cond ? '  ✓' : '  ✗') + ' ' + msg); if (!cond) failures++; };

// ── a tiny in-memory corpus service (same logic as integrations/corpus-service) ──
const svc = {
  signals: new Map(),          // `${topic}|${install}` -> count
  drafts: new Map(),           // topic -> { md, status, installs }
  entries: new Map(),          // slug -> { md, source_url }
  releases: [],

  ingest(payload) {
    assertSafe(payload);       // server-side boundary check (rejects raw text)
    let n = 0;
    for (const g of payload.gap) {
      if (!/^tk_[0-9a-f]{8}$/.test(g.topic_key)) continue;
      this.signals.set(`${g.topic_key}|${payload.install}`, g.count); n++;
    }
    return n;
  },
  clusters(minInstalls = 2) {
    const byTopic = new Map();
    for (const [k, count] of this.signals) {
      const [topic, install] = k.split('|');
      const e = byTopic.get(topic) || { installs: new Set(), total: 0 };
      e.installs.add(install); e.total += count; byTopic.set(topic, e);
    }
    return [...byTopic.entries()]
      .filter(([, e]) => e.installs.size >= minInstalls)
      .map(([topic, e]) => ({ topic, installs: e.installs.size, total: e.total }));
  },
  draft(topic, md) { this.drafts.set(topic, { md, status: 'pending' }); },
  approve(topic, slug, source_url) {
    const d = this.drafts.get(topic);
    if (!d || d.status !== 'pending') throw new Error('no pending draft');
    this.entries.set(slug, { md: d.md, source_url });
    d.status = 'approved';
  },
  release(signingKey) {
    const entries = [...this.entries.entries()].sort().map(([slug, v]) => ({ slug, ...v }));
    if (!entries.length) throw new Error('nothing approved');
    const canonical = JSON.stringify(entries);
    const content_hash = createHash('sha256').update(canonical).digest('hex');
    const sig = 'hmac-sha256:' + createHmac('sha256', signingKey).update(content_hash).digest('hex');
    const version = '2026-10-16.' + content_hash.slice(0, 8);
    const rel = { version, content_hash, sig, anchor_tx: 'unanchored', entries };
    this.releases.push(rel); return rel;
  },
};

log('\n━━ Phase G: two-install federated corpus demo ━━\n');

// ── INSTALL A: a gap asked many times, over masked aggregates only ──
log('install A — users keep asking something the KB cannot answer:');
const aGapRows = [
  { qkey: 'ขอ ใบรับรอง นักศึกษา ออนไลน์ ยังไง', hits: 9 },   // the hot gap
  { qkey: 'เรื่อง เฉพาะ คน เดียว', hits: 1 },                 // singleton → dropped by k-anon
];
const aPayload = buildPayload({ installId: 'pub:faculty-A', window: '2026-10-16', gapRows: aGapRows, confRows: [], routeCounts: { fast_path: 40, llm: 8, abstain: 3 } });
log('  masked payload A:', JSON.stringify(aPayload.gap));
check(!JSON.stringify(aPayload).match(/ใบรับรอง|นักศึกษา/), 'A: no raw gap text in payload (masked to tk_ buckets)');
check(aPayload.gap.length === 1, 'A: singleton gap dropped by k-anonymity');

// ── INSTALL B: the SAME topic (different phrasing) → same bucket ──
log('\ninstall B — a different faculty, same underlying need, different words:');
const bGapRows = [{ qkey: 'นักศึกษา ออนไลน์ ยังไง ขอ ใบรับรอง', hits: 7 }]; // reordered words
const bPayload = buildPayload({ installId: 'pub:faculty-B', window: '2026-10-16', gapRows: bGapRows, confRows: [], routeCounts: { fast_path: 30, llm: 5, abstain: 2 } });
log('  masked payload B:', JSON.stringify(bPayload.gap));
check(aPayload.gap[0].topic_key === bPayload.gap[0].topic_key, 'A and B collapse to the SAME topic bucket (cross-install signal)');

// ── CENTRAL: ingest, cluster, draft, HUMAN approve, signed release ──
log('\ncentral corpus service:');
svc.ingest(aPayload); svc.ingest(bPayload);
const cl = svc.clusters(2);
check(cl.length === 1 && cl[0].installs === 2, `cluster raised from 2 installs (total ${cl[0]?.total} hits)`);

const topic = cl[0].topic;
svc.draft(topic, `---\ntitle: การขอใบรับรองนักศึกษาออนไลน์\nkeywords: ใบรับรอง นักศึกษา ออนไลน์\nsource_url: https://graduate.mahidol.ac.th/\n---\nยื่นคำขอผ่านระบบ e-Document เลือก "หนังสือรับรองสถานภาพนักศึกษา" …`);
check(svc.drafts.get(topic).status === 'pending', 'draft is PENDING (never auto-published)');

// a human approves (the only path to a corpus entry)
svc.approve(topic, 'student-cert-online', 'https://graduate.mahidol.ac.th/');
check(svc.entries.has('student-cert-online'), 'HUMAN approval produced a corpus entry');

const SIGNING_KEY = 'demo-release-key';
const rel = svc.release(SIGNING_KEY);
log('  signed release:', rel.version, '· hash', rel.content_hash.slice(0, 16) + '…', '· anchor', rel.anchor_tx);
check(rel.sig.startsWith('hmac-sha256:'), 'release is signed');

// ── INSTALL B pulls the release and VERIFIES it ──
log('\ninstall B — pulls /release/latest and verifies before merging:');
const recomputed = createHash('sha256').update(JSON.stringify(rel.entries)).digest('hex');
check(recomputed === rel.content_hash, 'B: recomputed content hash matches the release (tamper check)');
const expectSig = 'hmac-sha256:' + createHmac('sha256', SIGNING_KEY).update(rel.content_hash).digest('hex');
check(expectSig === rel.sig, 'B: signature verifies with the shared signing key');
check(rel.entries.every(e => e.source_url && e.slug), 'B: every merged entry carries provenance (source_url + slug)');
log('  → install B now has the entry install A\'s users needed — nobody saw anyone\'s raw questions.');

log(failures ? `\n✗ ${failures} checks FAILED\n` : '\n✓ loop closed cleanly — federated, masked, human-approved, signed.\n');
process.exit(failures ? 1 : 0);
