// Each 👍/👎 must count once per ANSWER shown, not once per question text.   Run: node tests/feedback_votes.test.mjs
// Server: the real POST /feedback handler (integrations/kernel-worker/worker.mjs) on an in-memory stand-in for D1.
// Page:   the real fbUI() / sendFeedback() extracted from submissions/ui/chatbot.html, with a fake fetch.
import worker from '../integrations/kernel-worker/worker.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0, ipN = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

// -- a tiny D1 stand-in that understands exactly the statements the feedback path issues ------------------------------------------------
function fakeDB() {
  const feedbackLog = new Set(), metrics = {}, entry = {};
  const make = (sql, a) => ({
    first: async () => {
      if (sql.startsWith('SELECT 1 FROM feedback_log')) return feedbackLog.has(a[0]) ? { 1: 1 } : null;
      if (sql.startsWith("SELECT v FROM metrics WHERE k='policy_version'")) return metrics.policy_version == null ? null : { v: metrics.policy_version };
      if (sql.startsWith('SELECT conf, up, down FROM entry_conf')) return entry[a[0]] || null;
      throw new Error('unexpected first(): ' + sql);
    },
    run: async () => {
      if (sql.startsWith('INSERT INTO feedback_log')) { feedbackLog.add(a[0]); return {}; }
      if (sql.startsWith('INSERT INTO metrics')) { metrics[a[0]] = (metrics[a[0]] || 0) + a[1]; return {}; }
      if (sql.startsWith('INSERT INTO entry_conf')) { entry[a[0]] = { conf: a[1], up: a[2], down: a[3] }; return {}; }
      throw new Error('unexpected run(): ' + sql);
    },
    all: async () => ({ results: [] }),
  });
  const stmt = sql => ({ bind: (...a) => make(sql, a), ...make(sql, []) });   // D1 allows prepare(sql).first() as well as prepare(sql).bind(...).first()
  return { exec: async () => ({}), prepare: stmt, _: { feedbackLog, metrics, entry } };
}
async function vote(env, body) {
  const res = await worker.fetch(new Request('https://k.test/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://reflexwork.pages.dev', 'CF-Connecting-IP': `10.1.0.${++ipN}` }, body: JSON.stringify(body) }), env);
  return res.json();
}
const SAME_SENTENCE = { category: 'DataQuery', input: 'ส่งเล่มกี่วัน', proof: 'fccca71d8064e3abfccca71d8064e3ab', entry_id: 'thesis_submit_days' };
const uid = n => `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, '0')}`;

{ const env = { DB: fakeDB() };
  const a = await vote(env, { ...SAME_SENTENCE, reward: -1 }), b = await vote(env, { ...SAME_SENTENCE, reward: -1 });
  check('old client (no vote_id): the second vote on the same sentence is still de-duplicated (back-compat)', a.accepted === true && b.deduped === true && env.DB._.entry.thesis_submit_days.down === 1, JSON.stringify([a.accepted, b.deduped]));
}
{ const env = { DB: fakeDB() };
  const a = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: uid(1) }), b = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: uid(2) }), c = await vote(env, { ...SAME_SENTENCE, reward: 1, vote_id: uid(3) });
  const e = env.DB._.entry.thesis_submit_days;
  check('three different users, same sentence, same hash: all three votes count', a.accepted && b.accepted && c.accepted && e.down === 2 && e.up === 1, JSON.stringify(e));
  check('...and the entry confidence moved accordingly (two 👎 then a 👍 from 1.0)', Math.abs(e.conf - (0.85 * (0.85 * 0.85 + 0.15 * 0) + 0.15 * 1)) < 1e-9, String(e.conf));
}
{ const env = { DB: fakeDB() };
  const a = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: uid(7) }), b = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: uid(7) });
  check('the same vote_id twice (a retried request / double click) counts once', a.accepted === true && b.deduped === true && env.DB._.entry.thesis_submit_days.down === 1);
}
{ const env = { DB: fakeDB() };
  const a = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: '1' }), b = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: '2' });
  check('a trivially short vote_id is not accepted as an identity (falls back to the per-hash rule)', a.accepted === true && b.deduped === true);
}
{ const env = { DB: fakeDB() };
  const r = await vote(env, { ...SAME_SENTENCE, reward: -1, vote_id: "../../'; DROP TABLE x; --" + 'a'.repeat(30) });
  check('a hostile vote_id is stripped to safe characters before it is stored', [...env.DB._.feedbackLog].every(k => /^[A-Za-z0-9:-]+$/.test(k)) && r.accepted === true, [...env.DB._.feedbackLog].join());
}
{ const env = { DB: fakeDB() };
  const r = await vote(env, { reward: 1, vote_id: uid(9) });
  check('no input -> 400, nothing stored', r.error === 'input required' && env.DB._.feedbackLog.size === 0);
}

// -- the page ----------------------------------------------------------------------------------------------------------------------
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
const grab = re => { const m = html.match(re); if (!m) throw new Error('not found in chatbot.html: ' + re); return m[0]; };
const src = [grab(/function newVoteId\(\)\{[^\n]*\n/), grab(/function fbUI\(q, proof, entryId\)\{[\s\S]*?\n\}\n/), grab(/async function sendFeedback\(id, reward\)\{[\s\S]*?\n\}\n/)].join('\n');
const sent = [];
const ctx = { window: {}, fbN: 0, KERNEL_API: 'https://k.test', BANDIT: { reward() {} }, updateRatio() {}, document: { getElementById: () => ({ innerHTML: '' }) },
  fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { json: async () => ({ policy_version: 3 }) }; } };
const page = new Function(...Object.keys(ctx), src + '\nreturn { fbUI, sendFeedback };')(...Object.values(ctx));
page.fbUI('ส่งเล่มกี่วัน', 'HASH', 'thesis_submit_days'); page.fbUI('ส่งเล่มกี่วัน', 'HASH', 'thesis_submit_days');
await page.sendFeedback('fb1', -1); await page.sendFeedback('fb2', -1);
check('two answers to the SAME question get different vote ids (so two users are two votes)', sent.length === 2 && sent[0].vote_id && sent[1].vote_id && sent[0].vote_id !== sent[1].vote_id && sent[0].proof === sent[1].proof, JSON.stringify(sent.map(s => s.vote_id)));
check('the vote id is long enough for the server to accept it as an identity', sent.every(s => String(s.vote_id).replace(/[^A-Za-z0-9-]/g, '').length >= 16));
check('the page still sends everything the server needs (input, reward, entry id, proof)', sent[0].input === 'ส่งเล่มกี่วัน' && sent[0].reward === -1 && sent[0].entry_id === 'thesis_submit_days' && sent[0].proof === 'HASH');

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
