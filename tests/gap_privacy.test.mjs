// PDPA check O1 (docs/pdpa-check.md): GET /gaps gives the public counts only; the question samples need the staff token.
// And the stored gap key is built from the MASKED question (LINE sends the raw text).   Run: node tests/gap_privacy.test.mjs
import worker from '../integrations/kernel-worker/worker.mjs';

let pass = 0, fail = 0, ipN = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

// a D1 stand-in for exactly the statements the gap path issues
function fakeDB() {
  const gaps = new Map();
  const make = (sql, a) => ({
    run: async () => {
      if (sql.startsWith('INSERT INTO gap_log')) { const [k, sample, at, source] = a; const g = gaps.get(k); gaps.set(k, { qkey: k, sample, hits: (g?.hits || 0) + 1, last_at: at, source }); return {}; }
      throw new Error('unexpected run(): ' + sql);
    },
    all: async () => {
      if (sql.startsWith('SELECT sample, hits, last_at, source FROM gap_log')) return { results: [...gaps.values()] };
      return { results: [] };
    },
    first: async () => {
      if (sql.startsWith('SELECT COUNT(*) c')) return { c: gaps.size, s: [...gaps.values()].reduce((n, g) => n + g.hits, 0) };
      return null;
    },
  });
  return { exec: async () => ({}), prepare: sql => ({ bind: (...a) => make(sql, a), ...make(sql, []) }), _: { gaps } };
}
const call = (env, path, init = {}) => worker.fetch(new Request('https://k.test' + path, { ...init, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.2.0.${++ipN}`, ...(init.headers || {}) } }), env).then(r => r.json().then(j => ({ status: r.status, j })));

const env = { DB: fakeDB(), STAFF_TOKEN: 'staff-secret' };
await call(env, '/gap', { method: 'POST', body: JSON.stringify({ q: 'ที่จอดรถดาวอังคาร โทร 081-234-5678 อีเมล a.b@x.ac.th', source: 'line' }) });
const key = [...env.DB._.gaps.keys()][0] || '';
check('the stored key is built from the masked text (no phone, no email)', key && !/081|234|5678|a\.b|x\.ac/.test(key), key);

const pub = await call(env, '/gaps');
check('public: counts are there', pub.status === 200 && pub.j.distinct === 1 && pub.j.total_hits === 1 && pub.j.entries[0].hits === 1, JSON.stringify(pub.j));
check('public: no question sample in any row, and it says so', pub.j.entries.every(e => !('question' in e)) && pub.j.samples === 'staff_only', JSON.stringify(pub.j.entries));
const wrong = await call(env, '/gaps', { headers: { 'X-Staff-Token': 'guess' } });
check('a wrong token is the public view', wrong.j.entries.every(e => !('question' in e)));
const staff = await call(env, '/gaps', { headers: { 'X-Staff-Token': 'staff-secret' } });
check('staff: the masked sample is shown', staff.j.samples === 'shown' && /\[phone\]/.test(staff.j.entries[0].question) && !/081/.test(staff.j.entries[0].question), JSON.stringify(staff.j.entries));
const demo = await call({ DB: env.DB }, '/gaps');
check('no STAFF_TOKEN configured (local demo): samples shown, as for /kb-*', demo.j.samples === 'shown');

// PDPA check O3: the daily cron deletes gap rows older than 180 days and vote de-dup rows older than 365 days (the real scheduled()).
{ const deleted = [];
  const db = { exec: async () => ({}), prepare: sql => ({ bind: (...a) => ({ run: async () => { if (sql.startsWith('DELETE FROM')) deleted.push([sql, a[0]]); return { meta: { changes: 0 } }; },
    all: async () => ({ results: [] }), first: async () => null }), all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) };
  const jobs = []; const before = Date.now();
  await worker.scheduled({}, { DB: db }, { waitUntil: p => jobs.push(p) }); await Promise.all(jobs);
  const cut = re => (deleted.find(([s]) => re.test(s)) || [])[1];
  const day = 86400000, g = cut(/DELETE FROM gap_log WHERE last_at </), f = cut(/DELETE FROM feedback_log WHERE at </);
  check('cron deletes gap rows older than 180 days', g && Math.abs(before - 180 * day - g) < 60000, String(g));
  check('cron deletes vote de-dup rows older than 365 days', f && Math.abs(before - 365 * day - f) < 60000, String(f));
}
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
