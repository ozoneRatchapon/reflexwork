// Pitch material must not drift from what is measured. Run: node tests/slides_claims.test.mjs
//  - slide 6 ("dashboard") numbers = the retrieval eval, recomputed here by benchmark/compare/compare_retrievers.mjs
//  - the words we agreed not to use ("neurosymbolic", "BLAKE3 proof" for the replay hash) do not come back
// Needs knowledge-index.json (python3 submissions/build_knowledge_index.py), like the other KB tests.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const read = f => readFileSync(join(root, f), 'utf8');

const slides = read('submissions/ui/slides.html');
const a = slides.indexOf('<!-- Slide 6 — Executive Dashboard -->'), b = slides.indexOf('<!-- Slide 7 — Positioning');
check('slide 6 section found', a > 0 && b > a); const s6 = slides.slice(a, b);
check('slide 6 says it is an example screen from a test set, not live user data', /ตัวอย่างหน้าจอ/.test(s6) && /ไม่ใช่ข้อมูลผู้ใช้จริง/.test(s6) && !/แบบสด/.test(s6));
const kpis = [...s6.matchAll(/<div class="n">(\d+)%<\/div><div class="l">[^<]*?(\d+) จาก (\d+)/g)].map(m => ({ pct: +m[1], k: +m[2], n: +m[3] }));
check('slide 6 has the three KPIs (answered, handed on, wrong among answered)', kpis.length === 3, JSON.stringify(kpis));
check('each KPI percentage matches its own count (no 82/18 vs 82/14/4 style contradictions)', kpis.every(x => Math.round(x.k / x.n * 100) === x.pct), JSON.stringify(kpis));
check('answered + handed on = all test questions', kpis.length === 3 && kpis[0].k + kpis[1].k === kpis[0].n && kpis[1].n === kpis[0].n);

if (!existsSync(join(root, 'submissions/ui/knowledge-index.json'))) check('knowledge-index.json present (python3 submissions/build_knowledge_index.py)', false);
else if (kpis.length === 3) {
  const dir = mkdtempSync(join(tmpdir(), 'rw-slides-')), out = join(dir, 'm.json');
  execFileSync('node', [join(root, 'benchmark/compare/compare_retrievers.mjs'), '--json', out], { stdio: 'ignore' });
  const m = JSON.parse(readFileSync(out, 'utf8')); rmSync(dir, { recursive: true, force: true });
  const wrong = Math.round(m.rows.ours.errAtMatched);
  check(`slide 6 answered = measured (${m.answeredOurs} of ${m.n})`, kpis[0].k === m.answeredOurs && kpis[0].n === m.n, `slide ${kpis[0].k}/${kpis[0].n}, measured ${m.answeredOurs}/${m.n} - update the slide (and METHOD.md §5) after changing the KB or the eval`);
  check(`slide 6 wrong-among-answered = measured (${wrong} of ${m.answeredOurs})`, kpis[2].k === wrong && kpis[2].n === m.answeredOurs, `slide ${kpis[2].k}/${kpis[2].n}, measured ${wrong}/${m.answeredOurs}`);
}

const shown = ['submissions/ui/slides.html', 'submissions/ui/pitch.html', 'submissions/ui/chatbot.html', 'submissions/ui/try.html', 'submissions/ui/dashboard.html', 'submissions/concept-paper.md', 'README.md'];
check('"neurosymbolic" does not appear in pitch / UI / README / concept paper', shown.every(f => !/neuro-?symbolic/i.test(read(f))), shown.filter(f => /neuro-?symbolic/i.test(read(f))).join());
check('the replay hash is not called a "BLAKE3 proof" in pitch / UI / README / concept paper', shown.every(f => !/BLAKE3 proof/i.test(read(f))), shown.filter(f => /BLAKE3 proof/i.test(read(f))).join());
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
