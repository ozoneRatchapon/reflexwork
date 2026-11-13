// Per-pack route goldens (plan 019 item 6.3): benchmark/golden/<agency>/route.json is recorded by `pack-golden` (Rust, native) from the
// pack's own site; this checks that the SHIPPED wasm (submissions/ui/wasm, what the page and the LINE worker run) decides every case the
// same way, on the golden's own day, in an adopted site's state (no catalogue, AI off). Also: no case of a pack answers from an entry
// id the pack does not have. Run: node tests/pack_golden.test.mjs
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as WASM from '../submissions/ui/wasm/reflex_wasm.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
WASM.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });
const tmp = mkdtempSync(join(tmpdir(), 'rw-packgold-'));
// the golden's fields: the question, `route` (`not_found` for null), then the decision's set fields (as serde writes them, nulls left out)
const record = (q, d) => { const out = { q, route: d.route ?? 'not_found' }; for (const [k, v] of Object.entries(d)) if (k !== 'route' && v !== null && v !== undefined) out[k] = v; return out; };
const canon = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : 1)) : x);
// One Router per process (a pack's vocab installs once), so every pack is decided in a child of its own.
if (process.argv[2] === '--one') {
  const [, , , site, golden] = process.argv;
  const agency = JSON.parse(readFileSync(join(site, 'agency.json'), 'utf8')), kb = JSON.parse(readFileSync(join(site, 'knowledge-index.json'), 'utf8'));
  const { today, cases } = JSON.parse(readFileSync(golden, 'utf8'));
  const router = new WASM.Router(kb, null, agency.vocab ? JSON.stringify(agency.vocab) : undefined);
  const state = { progState: 'none', aiOff: true, pinnedId: null, programmeInFocus: null, today, agencyHasIt: !!agency.it };
  const diffs = cases.filter(c => canon(record(c.q, router.decision(c.q, state, null))) !== canon(c)).map(c => `${c.q}: golden ${canon(c)} wasm ${canon(record(c.q, router.decision(c.q, state, null)))}`);
  const ids = new Set(kb.map(e => e.id)), foreign = cases.filter(c => (c.entry && !ids.has(c.entry)) || (c.offered || []).some(id => !ids.has(id))).map(c => c.q);
  process.stdout.write(JSON.stringify({ n: cases.length, diffs, foreign }));
  process.exit(0);
}
for (const [pack, flags, golden] of [['examples/library-demo', [], 'benchmark/golden/library-demo/route.json'], ['packs/music-college', ['--draft'], 'benchmark/golden/college-of-music/route.json']]) {
  const site = join(tmp, pack.replace(/\W/g, '_'));
  execFileSync('node', [join(root, 'scripts/new_agency.mjs'), join(root, pack), site, ...flags], { stdio: 'pipe' });
  const r = JSON.parse(execFileSync('node', [fileURLToPath(import.meta.url), '--one', site, join(root, golden)], { encoding: 'utf8' }));
  check(`${pack}: the shipped wasm decides all ${r.n} golden cases as recorded`, r.n > 0 && !r.diffs.length, r.diffs.slice(0, 3).join(' | '));
  check(`${pack}: every answered or offered entry is one of the pack's own`, !r.foreign.length, r.foreign.join(', '));
}
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
