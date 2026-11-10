// The LINE contract end to end (plan 009 C4): for every question of benchmark/golden/line_route.json (recorded from the native Rust
// Router by crates/reflex-wasm/tests/golden_line.rs), the LINE worker's own wasm build decides the same, every decision has a LINE view,
// and the view names only entries LINE has. A stale submissions/ui/wasm build, or a route views.mjs cannot show, fails here.
// Run: node tests/line_route.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';
register('./lib/wasm_module_hook.mjs', import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { decideLine, nearTitles } = await import('../integrations/line-worker/worker.mjs');
const { lineView, LINE_ROUTES } = await import('../integrations/line-worker/views.mjs');
const { KB } = await import('../integrations/line-worker/kb-data.mjs');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

const TODAY = '2026-11-07';   // the contract's day (golden_line.rs)
const golden = JSON.parse(readFileSync(join(root, 'benchmark/golden/line_route.json'), 'utf8'));
const byId = new Map(KB.map(e => [e.id, e]));
const strip = d => Object.fromEntries(Object.entries(d).filter(([k, v]) => k === 'route' || v !== null));
const issue = () => null;
// serde_json writes keys sorted; compare key-order-free
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
let differ = [], unshown = [], empty = [], unknownIds = [];
const seen = new Set();
for (const row of golden) {
  const { q, ...want } = row;
  const got = strip(decideLine(q, TODAY));
  if (JSON.stringify(canon(got)) !== JSON.stringify(canon(want))) differ.push({ q, got, want });
  if (got.route !== null && !LINE_ROUTES.has(got.route)) unshown.push(`${got.route}: ${q}`);
  seen.add(got.route);
  const v = lineView(got, q, { byId, near: () => nearTitles(q), issue, today: TODAY });
  if (!v.text || !v.text.trim() || !v.footer.judge) empty.push(`${got.route}: ${q}`);
  for (const id of [got.entry, ...(got.offered || []), ...(got.stuck?.picks || [])].filter(Boolean)) if (!byId.has(id)) unknownIds.push(`${id} (${q})`);
}
check(`the worker's wasm decides like native Rust on all ${golden.length} questions (rebuild: bash crates/reflex-wasm/build.sh)`, !differ.length, `${differ.length} differ, first ${JSON.stringify(differ[0])}`);
check('every decision is a route LINE can show (views.mjs LINE_ROUTES) or not-found', !unshown.length, unshown.slice(0, 3).join(' | '));
check('every route of LINE_ROUTES occurs in the contract (a route nobody can reach would be dead view code)', [...LINE_ROUTES].every(r => seen.has(r)), [...LINE_ROUTES].filter(r => !seen.has(r)).join(','));
check('every view has a reply text and a judge footer', !empty.length, empty.slice(0, 3).join(' | '));
check('every entry a decision names is in LINE\'s manual copy', !unknownIds.length, unknownIds.slice(0, 3).join(' | '));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
