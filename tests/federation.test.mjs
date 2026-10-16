// Unit tests for the federation signal layer (distributable-kernel spec, Phase C).
// Run: node tests/federation.test.mjs   (exit 0 = pass, 1 = fail)
//
// The load-bearing test is F1: no raw text / PII can appear in an outbound
// payload, under any input. k-anonymity and bucketing are checked too.
import {
  topicKey, buildGapSignals, buildConfSignals, buildRouteSignal,
  buildPayload, assertSafe, K_ANON_MIN_HITS,
} from '../integrations/_shared/federation.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
};
const truthy = (name, got) => { const ok = !!got; console.log((ok?'✓':'✗')+' '+name); ok?pass++:fail++; };
const throws = (name, fn) => {
  let threw = false; try { fn(); } catch { threw = true; }
  console.log((threw ? '✓' : '✗') + ' ' + name + (threw ? '' : ' — expected throw'));
  threw ? pass++ : fail++;
};

// --- topicKey: coarse, stable, non-reversible --------------------------------
truthy('topicKey stable for same input',
  topicKey('ส่ง รูปเล่ม กี่ วัน') === topicKey('ส่ง รูปเล่ม กี่ วัน'));
eq('topicKey phrasing collapses (token-set, sorted)',
  topicKey('turnitin เกิน 25 ทำ'), topicKey('ทำ เกิน turnitin 25'));
eq('topicKey empty → null', topicKey('   '), null);
truthy('topicKey is an opaque short id', /^tk_[0-9a-f]{8}$/.test(topicKey('thesis submit deadline')));

// --- k-anonymity: a bucket under the floor is dropped ------------------------
const gapRows = [
  { qkey: 'ส่ง รูปเล่ม กี่ วัน', hits: 9 },        // above floor
  { qkey: 'turnitin เกิน 25', hits: 6 },           // above floor
  { qkey: 'เรื่อง เฉพาะ คน เดียว', hits: 1 },      // singleton → dropped
];
const gaps = buildGapSignals(gapRows);
truthy('k-anon keeps above-floor buckets', gaps.length === 2);
truthy('k-anon drops singleton bucket', !gaps.some(g => g.count < K_ANON_MIN_HITS));
truthy('gap signals carry only {topic_key,count}',
  gaps.every(g => Object.keys(g).sort().join(',') === 'count,topic_key'));

// --- conf signals: hash + signed delta, no text ------------------------------
const conf = buildConfSignals([{ entry_hash: 'h_abc', conf: 0.2 }, { entry_hash: 'h_def', conf: 0.9 }]);
eq('conf delta signed from 0.5', conf, [{ entry_hash: 'h_abc', delta: -0.3 }, { entry_hash: 'h_def', delta: 0.4 }]);

// --- route signal ------------------------------------------------------------
eq('route counts', buildRouteSignal({ fast_path: 80, llm: 18, abstain: 2 }), { fast_path: 80, llm: 18, abstain: 2 });

// --- F1 BOUNDARY: raw text / PII can never leave -----------------------------
// Feed an adversarial gap key that still contains a phone-shaped token; the
// payload must contain NO such substring (topicKey hashes it away).
const payload = buildPayload({
  installId: 'pub:ab12',
  window: '2026-10-16',
  gapRows: [
    { qkey: 'ขอ เบอร์ 0849996022 ของ อาจารย์', hits: 7 },
    { qkey: 'a@b.com ช่วย ด้วย', hits: 8 },
  ],
  confRows: [{ entry_hash: 'h_x', conf: 0.3 }],
  routeCounts: { fast_path: 5, llm: 1, abstain: 1 },
});
const blob = JSON.stringify(payload);
truthy('F1: no phone digits in payload', !/0849996022/.test(blob));
truthy('F1: no email in payload', !/a@b\.com/.test(blob));
truthy('F1: no "เบอร์"/"อาจารย์" raw tokens in payload', !/เบอร์|อาจารย์|ช่วย/.test(blob));
truthy('F1: gap buckets are opaque ids only', payload.gap.every(g => /^tk_[0-9a-f]{8}$/.test(g.topic_key)));

// assertSafe rejects a forbidden field if one ever slips in
throws('assertSafe rejects a raw "question" field',
  () => assertSafe({ install: 'pub:x', gap: [{ topic_key: 'tk_1', question: 'raw text' }] }));
throws('assertSafe rejects a suspiciously long string value',
  () => assertSafe({ install: 'pub:x', note: 'x'.repeat(200) }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
