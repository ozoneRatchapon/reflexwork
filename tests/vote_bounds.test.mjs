// Best-Belief vote bounds (integrations/_shared/beta_bound.mjs, from katgpt-rs best_belief.rs) and the /entry-conf order built on them.
// Run: node tests/vote_bounds.test.mjs
import { beta_quantile, vote_bounds } from '../integrations/_shared/beta_bound.mjs';
import worker from './lib/kernel_worker.mjs';   // the real worker; its Rust rules load as a .wasm module
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const near = (a, b, t = 1e-4) => Math.abs(a - b) < t;
// closed forms: Beta(1,1) is uniform; Beta(2,1) cdf x^2; Beta(1,b) cdf 1-(1-x)^b
check('Beta(1,1) 5% quantile = 0.05', near(beta_quantile(0.05, 1, 1), 0.05));
check('Beta(2,1) 5% quantile = sqrt(0.05)', near(beta_quantile(0.05, 2, 1), Math.sqrt(0.05)));
check('Beta(1,6) 95% quantile = 1 - 0.05^(1/6)', near(beta_quantile(0.95, 1, 6), 1 - Math.pow(0.05, 1 / 6)));
check('symmetric: Beta(5,3) q = 1 - Beta(3,5) (1-q)', near(beta_quantile(0.2, 5, 3), 1 - beta_quantile(0.8, 3, 5)));
const b22 = vote_bounds(2, 0), b5060 = vote_bounds(50, 10);
check('2/2 thumbs-up no longer beats 50 up / 10 down on the "at least" bound (katgpt Bench 010 case)', b22.lo < b5060.lo, `${b22.lo} vs ${b5060.lo}`);
check('one 👎 is not "confidently bad"; five 👎 are (upper bound)', vote_bounds(0, 1).hi > 0.7 && vote_bounds(0, 5).hi < 0.45, `${vote_bounds(0, 1).hi} ${vote_bounds(0, 5).hi}`);
check('bad input is treated as 0 votes', JSON.stringify(vote_bounds(-3, 'x')) === JSON.stringify(vote_bounds(0, 0)));
check('monotone: more 👍 never lowers either bound', [0, 1, 2, 5, 20].every((u, i, a) => i === 0 || (vote_bounds(u, 3).lo > vote_bounds(a[i - 1], 3).lo && vote_bounds(u, 3).hi > vote_bounds(a[i - 1], 3).hi)));
// /entry-conf order on a stand-in D1
const rows = [{ id: 'one_down', conf: 0, up: 0, down: 1 }, { id: 'five_down', conf: 0, up: 0, down: 5 }, { id: 'liked', conf: 0, up: 9, down: 1 }, { id: 'mixed', conf: 0, up: 3, down: 3 }];
const DB = { prepare: sql => ({ bind: () => DB.prepare(sql), all: async () => ({ results: sql.includes('FROM entry_conf') ? rows : [] }), run: async () => ({}), first: async () => null }), exec: async () => ({}), batch: async () => [] };
const res = await worker.fetch(new Request('https://k/entry-conf'), { DB });
const j = await res.json(), ids = (j.entries || []).map(e => e.id);
check('/entry-conf lists the confidently bad entry first and the liked one last', ids[0] === 'five_down' && ids[ids.length - 1] === 'liked', ids.join(','));
check('/entry-conf returns lo / hi / votes for each entry', (j.entries || []).every(e => e.lo < e.conf && e.conf < e.hi && Number.isInteger(e.votes)), JSON.stringify(j.entries && j.entries[0]));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
