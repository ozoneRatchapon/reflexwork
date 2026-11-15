// Plan 019 item 6.2: the LINE worker's decision and views on ANOTHER agency's manual. For each pack it builds the site index
// (scripts/new_agency.mjs), writes the LINE KB module with crates/pack-tools `pack-line-kb --agency` (the same shape as the Graduate
// School's integrations/line-worker/kb-data.mjs), and runs the pack's own questions plus small-talk probes through line_core.mjs and
// views.mjs on the shipped wasm Router: every decision has a LINE view, names only the pack's entries, and no reply speaks as the
// Graduate School. Plan 019 item 6.4: the build's --with-line --with-kernel configs (pack-workers) hold placeholders only, never the
// Graduate School's IDs, and the generated LINE entry runs as a worker. No LINE account is connected (that is gated).
// Run: node tests/line_pack.test.mjs
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';
import * as WASM from '../submissions/ui/wasm/reflex_wasm.js';
register('./lib/wasm_module_hook.mjs', import.meta.url);   // the generated worker imports the .wasm as Workers do
import { makeLine } from '../integrations/line-worker/line_core.mjs';
import { lineView, LINE_ROUTES } from '../integrations/line-worker/views.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
WASM.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });

const TODAY = '2026-11-14';
// what only the Graduate School says: its name, its thesis topics, its hosts and LINE account
const GRAD = /บัณฑิตวิทยาลัย|วิทยานิพนธ์|รูปเล่ม|turnitin|graduate\.mahidol|@gradmu/i;
const PROBES = ['สวัสดีครับ', 'ทำอะไรได้บ้าง', 'ขอบคุณครับ', 'บายครับ', 'สบายดีไหม', 'เริ่มใหม่', 'มีอะไรบ้าง', '555', 'ติดปัญหาครับ'];
const GRAD_IDS = new Set(JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')).map(e => e.id));
const PACKS = [
  { dir: 'examples/library-demo', flags: [] },
  { dir: 'packs/music-college', flags: ['--draft'] },   // nothing approved yet: a preview build (never deployed)
];
const tmp = mkdtempSync(join(tmpdir(), 'rw-line-pack-'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const lineKb = (...args) => run('cargo', ['run', '-q', '-p', 'pack-tools', '--bin', 'pack-line-kb', '--', ...args]);

for (const { dir, flags } of PACKS) {
  const name = dir.split('/').pop(), out = join(tmp, name), mod = join(tmp, `${name}-kb.mjs`);
  const log = run('node', [join(root, 'scripts/new_agency.mjs'), join(root, dir), out, ...flags, '--with-line', '--with-kernel']);
  const index = join(out, 'knowledge-index.json'), agencyFile = join(root, dir, 'agency.json');
  lineKb(index, mod, '--agency', agencyFile);
  check(`${name}: pack-line-kb --check says the module it wrote is up to date`, /up to date/.test(lineKb(index, mod, '--agency', agencyFile, '--check')));
  const { KB, LINE_VOICE } = await import(pathToFileURL(mod).href);
  const want = JSON.parse(readFileSync(index, 'utf8')).map(e => e.id);
  check(`${name}: the LINE manual is exactly the pack's ${want.length} entries, none of the Graduate School's`,
    KB.length === want.length && KB.every((e, i) => e.id === want[i] && !GRAD_IDS.has(e.id)), KB.map(e => e.id).filter(id => GRAD_IDS.has(id)).join(','));
  const agency = JSON.parse(readFileSync(agencyFile, 'utf8'));
  check(`${name}: LINE_VOICE carries the agency's persona and example questions`,
    LINE_VOICE && LINE_VOICE.persona.hello === agency.persona.hello && LINE_VOICE.examples.length === agency.examples.length);

  // 6.4: the configs next to the site (never inside the published folder), placeholders only, and the LINE entry answers as a worker
  const workers = `${out}.workers`, conf = ['line/wrangler.toml', 'kernel/wrangler.toml'].map(f => readFileSync(join(workers, f), 'utf8')).join('\n');
  check(`${name}: --with-line --with-kernel writes the worker configs beside the site and lists what to fill in`,
    !existsSync(join(out, 'line')) && /still to fill in \(5;/.test(log) && /database_name = "reflexwork-[a-z0-9-]+"/.test(conf), log.slice(-400));
  check(`${name}: the configs copy nothing of the Graduate School's deployment (D1 id, account host, site, service names)`,
    !/a10fb432|solana-thailand|reflexwork\.pages\.dev|service = "reflexwork-(?:kernel|llm-proxy)"/.test(conf));
  const gen = await import(pathToFileURL(join(workers, 'line/kb-data.mjs')).href);
  check(`${name}: the generated line/kb-data.mjs is the same manual and voice`, JSON.stringify([gen.KB, gen.LINE_VOICE]) === JSON.stringify([KB, LINE_VOICE]));
  const { default: worker } = await import(pathToFileURL(join(workers, 'line/worker.mjs')).href);
  const health = await worker.fetch(new Request('https://line.test/health'), {}, { waitUntil() {} });
  const other = await worker.fetch(new Request('https://line.test/x'), {}, { waitUntil() {} });
  check(`${name}: the generated LINE entry runs as a worker (/health ok, other paths 404)`, (await health.text()) === 'ok' && other.status === 404);

  const line = makeLine(KB, WASM.Router);
  const qfile = join(root, dir, 'questions.txt');
  const own = existsSync(qfile) ? readFileSync(qfile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')) : [];
  const questions = [...new Set([...agency.examples.map(e => e.q), ...own, ...PROBES])];
  const unshown = [], empty = [], unknown = [], leaks = [], unanswered = [];
  for (const q of questions) {
    const d = line.decide(q, TODAY);
    if (d.route !== null && !LINE_ROUTES.has(d.route)) unshown.push(`${d.route}: ${q}`);
    const v = lineView(d, q, { byId: line.byId, near: () => line.near(q), issue: () => null, today: TODAY, voice: LINE_VOICE });
    if (!v.text || !v.text.trim() || !v.footer.judge) empty.push(`${d.route}: ${q}`);
    for (const id of [d.entry, ...(d.offered || []), ...(d.stuck?.picks || [])].filter(Boolean)) if (!line.byId.has(id)) unknown.push(`${id} (${q})`);
    if (GRAD.test(v.text)) leaks.push(`${d.route}: ${q} -> ${v.text.slice(0, 80)}`);
    if (agency.examples.some(e => e.q === q) && v.gap) unanswered.push(`${d.route}: ${q}`);
  }
  check(`${name}: all ${questions.length} questions get a route LINE can show (or not-found)`, !unshown.length, unshown.slice(0, 3).join(' | '));
  check(`${name}: every view has a reply text and a judge footer`, !empty.length, empty.slice(0, 3).join(' | '));
  check(`${name}: every entry a decision names is in the pack`, !unknown.length, unknown.slice(0, 3).join(' | '));
  check(`${name}: no reply speaks as the Graduate School (small talk, restart, overview, answers)`, !leaks.length, leaks.slice(0, 3).join(' | '));
  check(`${name}: every example question of agency.json is answered from the manual on LINE`, !unanswered.length, unanswered.join(' | '));
}
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
