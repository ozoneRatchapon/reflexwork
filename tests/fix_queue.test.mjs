// Plan 008 steps 2-5 on the real kernel worker over real SQL (node:sqlite as D1): reasons, the entries-to-fix queue, a "fix this entry"
// draft that replaces the entry when approved, and the 👎 share before / after the fix.   Run: node tests/fix_queue.test.mjs
import worker from './lib/kernel_worker.mjs';
import { d1 } from './lib/d1_sqlite.mjs';

let pass = 0, fail = 0, ip = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const env = { DB: d1(), STAFF_TOKEN: 'tok' };
const call = (path, body, staff) => worker.fetch(new Request('https://k.test' + path, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.3.${ip >> 8}.${++ip & 255}`, ...(staff ? { 'X-Staff-Token': 'tok' } : {}) } } : { headers: { 'CF-Connecting-IP': `10.3.${ip >> 8}.${++ip & 255}`, ...(staff ? { 'X-Staff-Token': 'tok' } : {}) } }), env).then(r => r.json());
let vid = 0; const vote = (entry_id, reward, reason) => call('/feedback', { category: 'DataQuery', input: 'q', reward, entry_id, reason, vote_id: `aaaaaaaa-bbbb-cccc-dddd-${String(++vid).padStart(12, '0')}` });

await vote('fee_entry', -1, 'outdated'); await vote('fee_entry', -1, 'outdated'); await vote('fee_entry', -1, 'wrong'); await vote('fee_entry', 1);
await vote('days_entry', -1, 'incomplete'); await vote('days_entry', -1);
await vote('good_entry', 1); await vote('good_entry', 1);
const q = await call('/fix-queue');
check('queue: only entries with a 👎, most 👎 first', JSON.stringify(q.entries.map(e => e.id)) === '["fee_entry","days_entry"]', JSON.stringify(q.entries));
check('queue: counts per reason and the top reason', q.entries[0].reasons.outdated === 2 && q.entries[0].reasons.wrong === 1 && q.entries[0].top_reason === 'outdated' && q.entries[1].reason_total === 1, JSON.stringify(q.entries[0]));
check('queue: no text in the public answer', !/"q"|input|question/.test(JSON.stringify(q)));

const noTok = await call('/kb-draft', { question: 'ค่าธรรมเนียม', answer: 'ใหม่', target_id: 'fee_entry' });
check('a fix draft needs the staff token', noTok.error === 'staff token required');
const draft = await call('/kb-draft', { question: 'ค่าธรรมเนียม', answer: 'ค่าธรรมเนียม 2570: 1,500 บาท', target_id: 'fee_entry' }, true);
const bad = await call('/kb-draft', { question: 'x', answer: 'y', target_id: '../../etc' }, true);
const drafts = await call('/kb-drafts', null, true);
check('the draft names the entry it fixes; a malformed target is dropped', drafts.drafts.find(d => d.id === draft.id)?.target_id === 'fee_entry' && drafts.drafts.find(d => d.id === bad.id)?.target_id === null, JSON.stringify(drafts.drafts));

const before = await call('/fix-effect?id=fee_entry');
check('fix effect before any fix: not fixed', before.fixed === false);
await call('/kb-approve', { id: draft.id, by: 'test' }, true);
const live = await call('/live-kb');
check('approved fix is live with its target id (the chat swaps the entry)', live.entries.some(e => e.target_id === 'fee_entry' && /1,500/.test(e.answer)), JSON.stringify(live.entries));
const draft2 = await call('/kb-draft', { question: 'ค่าธรรมเนียม', answer: 'ค่าธรรมเนียม 2570: 1,600 บาท', target_id: 'fee_entry' }, true);
await call('/kb-approve', { id: draft2.id, by: 'test' }, true);
const live2 = await call('/live-kb');
check('a newer fix of the same entry retracts the older live one', live2.entries.filter(e => e.target_id === 'fee_entry').length === 1 && /1,600/.test(live2.entries.find(e => e.target_id === 'fee_entry').answer));
const q2 = await call('/fix-queue');
check('queue shows when the entry was last fixed', Number(q2.entries.find(e => e.id === 'fee_entry').last_fix_at) > 0);

const eff = await call('/fix-effect?id=fee_entry');
check('fix effect: the fix day is on neither side (per-day counts cannot split it); too few votes to say anything', eff.fixed === true && eff.verdict === 'too_few_votes' && eff.after.votes === 0 && eff.before.votes === 0, JSON.stringify(eff));
// votes on other days, written straight into the per-day table: 12 three days before the fix, 10 the day after
const fixedDay = Math.floor(eff.fixed_at / 86400000);
env.DB.raw.prepare('INSERT INTO entry_vote_day (id, day, up, down) VALUES (?, ?, ?, ?) ON CONFLICT(id, day) DO UPDATE SET up=up+excluded.up, down=down+excluded.down').run('fee_entry', fixedDay - 3, 2, 10);
env.DB.raw.prepare('INSERT INTO entry_vote_day (id, day, up, down) VALUES (?, ?, ?, ?)').run('fee_entry', fixedDay + 1, 9, 1);
const eff2 = await call('/fix-effect?id=fee_entry');
check('fix effect: 👎 share before vs after, and "lower" only with >= 10 votes a side', eff2.before.votes >= 10 && eff2.after.votes >= 10 && eff2.verdict === 'lower' && eff2.after.down_share < eff2.before.down_share, JSON.stringify(eff2));
check('fix effect refuses a malformed id', (await call('/fix-effect?id=a%20b')).error === 'id required');

console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
