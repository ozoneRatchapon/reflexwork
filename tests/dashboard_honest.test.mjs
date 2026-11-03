// The staff/executive dashboard must not show claims we cannot back on stage:
// no µs timing (the kernel stores 0), no "BLAKE3 signature" wording, a visible
// test-phase label, and a gap backlog without test/probe rows or mangled text.
// Run: node tests/dashboard_honest.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dash = readFileSync(join(root, 'submissions/ui/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

check('no µs timing anywhere on the page', !/µs/.test(dash));
check('no BLAKE3 / signature / proof claim', !/blake3|BLAKE3|ลายเซ็น|proof/.test(dash));
check('audit table has exactly 3 columns', /<thead><tr><th>เวลา<\/th><th>ประเภทงาน<\/th><th>เส้นทาง<\/th><\/tr><\/thead>/.test(dash) && !/colspan="5"/.test(dash));
check('test-phase label is in the page', /id="phase"[^>]*>🧪 ข้อมูลช่วงทดสอบ/.test(dash));
check('demo mode relabels the banner as sample data', /\$\('phase'\)\.textContent = '🧪 โหมดสาธิต/.test(dash));
check('live gap rows go through clean_gaps', /const gaprows = clean_gaps\(/.test(dash));

// Execute the real clean_gaps against rows shaped like the live /gaps output.
const src = dash.match(/const REAL_GAP_SOURCES[\s\S]*?\n}\n/);
check('clean_gaps source found', !!src);
if (src) {
  const note = { hidden: true, textContent: '' };
  const clean_gaps = new Function('$', src[0] + 'return clean_gaps;')(() => note);
  const rows = [
    { question: '��� ช่วยร่างอีเมล', source: 'web' },
    { question: 'เรียนไรดี', source: 'web' },
    { question: 'วีซ่าต่ออายุ', source: 'line' },
    { question: 'วิธีทำต้มยำกุ้ง!!!', source: 'test' },
    { question: 'final review', source: 'review' },
    { question: 'verdict test', source: 'verdict' },
  ];
  const kept = clean_gaps(rows);
  check('keeps only web/line rows with clean text', JSON.stringify(kept.map(r => r.question)) === JSON.stringify(['เรียนไรดี', 'วีซ่าต่ออายุ']), JSON.stringify(kept));
  check('says how many rows were hidden', note.hidden === false && note.textContent.includes('4'), note.textContent);
  clean_gaps([{ question: 'ok', source: 'web' }]);
  check('note hides itself when nothing was filtered', note.hidden === true);
}
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
