// The "how it works" deck (submissions/ui/how-it-works.html) quotes numbers; each one is marked data-claim="..." and must equal the
// measured / counted value, so the deck cannot drift from the system.   Run: node tests/how_it_works.test.mjs
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const html = read('submissions/ui/how-it-works.html');
const claim = k => [...html.matchAll(new RegExp(`<span data-claim="${k}">(\\d+)</span>`, 'g'))].map(m => +m[1]);

check('every slide has an id, a page number slot and the nav links to existing ids', (() => {
  const ids = new Set([...html.matchAll(/<section class="slide" id="(s\d+)"/g)].map(m => m[1]));
  const links = [...html.matchAll(/<a [^>]*href="#(s\d+)"/g)].map(m => m[1]);
  return ids.size >= 14 && links.length >= 4 && links.every(l => ids.has(l)) && (html.match(/<div class="pageno">/g) || []).length === ids.size; })());
check('each audience part exists (everyone / staff / executives / developers)', ['aud all', 'aud staff', 'aud exec', 'aud dev'].every(c => html.includes(`class="${c}"`)));
check('no claims the project has retracted ("neurosymbolic", "BLAKE3 proof")', !/neuro-?symbolic/i.test(html) && !/BLAKE3 proof/i.test(html));
check('the cost slide labels the ฿ figure as an estimate and does not state a measured % saving', /ประมาณการ/.test(html) && !/ลด(?:ต้นทุน)?[^<]{0,12}\d+\s*%/.test(html));

if (!existsSync(join(root, 'submissions/ui/knowledge-index.json'))) { check('knowledge-index.json present (python3 submissions/build_knowledge_index.py)', false); }
else {
  const dir = mkdtempSync(join(tmpdir(), 'rw-hiw-')), out = join(dir, 'm.json');
  execFileSync('node', [join(root, 'benchmark/compare/compare_retrievers.mjs'), '--json', out], { stdio: 'ignore' });
  const m = JSON.parse(readFileSync(out, 'utf8')); rmSync(dir, { recursive: true, force: true });
  const pct = x => Math.round(x / m.labelled * 100), P = JSON.parse(read('submissions/ui/programmes.json')).programmes, KB = JSON.parse(read('submissions/ui/knowledge-index.json'));
  const want = { kb: KB.length, prog: P.length, ann: P.filter(p => p.announcement).length, majors: P.filter(p => p.sub_announcements).length,
    labelled: m.labelled, r1: pct(m.rows.ours.r1), r3: pct(m.rows.ours.r3), n: m.n, n2: m.n, answered: m.answeredOurs, answered2: m.answeredOurs, wrong: m.shippedWrong };
  for (const [k, v] of Object.entries(want)) { const got = claim(k); check(`claim "${k}" = ${v}`, got.length >= 1 && got.every(x => x === v), `deck ${got.join(',') || 'missing'} vs ${v}`); }
  const nTests = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).length, floor = +(html.match(/<span data-min="tests">(\d+)<\/span>\+/) || [])[1];
  check(`the deck's "${floor}+ test files" is a true floor (${nTests} files)`, floor > 0 && nTests >= floor, `${nTests} < ${floor}`);
  const bars = [...html.matchAll(/<div class="tr"><i style="width:([\d.]+)%/g)].map(x => +x[1]);
  const exp = [pct(m.rows.ours.r1), pct(m.rows.ours.r3), m.answeredOurs / m.n * 100, m.shippedWrong / m.answeredOurs * 100];
  check('the four bars are drawn at the measured proportions (±1 point)', bars.length === 4 && bars.every((b, i) => Math.abs(b - exp[i]) <= 1), `${bars} vs ${exp.map(x => x.toFixed(1))}`);
}
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
