// Anything a visitor can type, or the public /gap and /feedback endpoints can store, must never reach innerHTML as markup.
// Static guard (the live page is also probed by scripts/demo_smoke.mjs step 9d). Run: node tests/xss_guard.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

const chat = read('submissions/ui/chatbot.html');
check('the user bubble is set with textContent', /if\(cls==='u'\)\s*d\.textContent=html;\s*else d\.innerHTML=html;/.test(chat));
check('the evidence-card question label is escaped', /const qlabel = qsrc \? _lEsc\(/.test(chat));

const dash = read('submissions/ui/dashboard.html');
check('dashboard defines esc()', /const esc = v => /.test(dash));
// server-supplied text fields that were once interpolated raw
const RAW = ['e.source', 'd.source', 'd.category', 'e.category', 'e.question', 'g.question', 'd.title', 'd.answer', 'e.id', 'name'];
// the only raw interpolation allowed is the block of hard-coded sample rows (demoGaps), which never sees server data
const di = dash.indexOf('demoGaps.map('), dj = di < 0 ? -1 : dash.indexOf(".join('')", di);
check('the sample-data block (demoGaps) was found, so it can be excluded precisely', di > 0 && dj > di);
const live = dash.slice(0, di) + dash.slice(dj);
for (const f of RAW) {
  const bad = [...live.matchAll(new RegExp('\\$\\{\\s*' + f.replace('.', '\\.') + '\\s*(\\|\\|[^}]*)?\\}', 'g'))].map(m => m[0]);
  check(`dashboard: ${f} is never interpolated raw`, bad.length === 0, bad.join(' | '));
}
check('dashboard: draft id in onclick is numeric', /approveDraft\(\$\{Number\(d\.id\)\|\|0\}\)/.test(dash));
check('student-desk / try never print a fake "0 µs"', !/\$\{us\} µs/.test(read('submissions/ui/student-desk.html')) && !/\$\{us\} µs/.test(read('submissions/ui/try.html')) && !/\$\{a\.us\} µs/.test(read('submissions/ui/try.html')));
check('try.html cannot print Infinity (the speed-up divides by at least the clock resolution)', /Math\.max\(parseFloat\(a\.us\), 100\)/.test(read('submissions/ui/try.html')));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
