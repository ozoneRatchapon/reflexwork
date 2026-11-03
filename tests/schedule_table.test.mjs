// Programme card: the admission schedule is a table (rows = activities, columns = rounds), with every date kept.
// Runs the real _pSchedule() from chatbot.html over every programme in programmes.json. Run: node tests/schedule_table.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const doc = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8'));
const P = doc.programmes || doc;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = page.match(/function _pSchedule\(lines\)\{[\s\S]*?\n\}\n/);
check('_pSchedule source found', !!src);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _pSchedule = new Function('_pEsc', src[0] + 'return _pSchedule;')(esc);
const S = P.map(p => p.announcement && p.announcement.sections && p.announcement.sections['กำหนดการสอบคัดเลือก']).filter(Boolean);
let tables = 0, lists = 0, lost = [];
const dateRe = /\d{1,2} [ก-๙]{1,4}\.(?:[ก-๙]{1,2}\.)? ?\d{4}/g;
for (const L of S) {
  const r = _pSchedule(L), out = r.table + r.notes.join(' ') + r.list.join(' ');
  r.table ? tables++ : lists++;
  const want = L.join(' ').match(dateRe) || [], got = out.match(dateRe) || [];
  if (want.length !== got.length) lost.push(`${want.length}->${got.length}`);
}
check(`every date in every schedule is shown (${S.length} schedules)`, lost.length === 0, lost.slice(0, 5).join(','));
check(`schedules rendered as a table: ${tables} of ${S.length} (list fallback ${lists})`, tables >= S.length - 5, `${tables}`);
const four = S.find(L => L.some(l => /^รอบการรับสมัคร.*\| รอบ 4/.test(l)));
const t = _pSchedule(four).table;
check('header has the rounds as columns', /<th scope="col">กิจกรรม<\/th><th scope="col">รอบ 1<\/th>/.test(t));
check('the round name is not repeated inside the cells', !/<td>รอบ \d/.test(t), t.slice(0, 200));
check('activities are row headers', /<th scope="row">สอบสัมภาษณ์<\/th>/.test(t));
check('rows after the 8th line are kept (old list cut at 8)', /ประกาศรายชื่อนักศึกษาที่รายงานตัวเข้าศึกษา/.test(t));
check('notes go under the table without the "หมายเหตุ :" label', _pSchedule(four).notes.some(n => /โปรดพิจารณาช่วงเวลา/.test(n)) && !_pSchedule(four).notes.some(n => /^หมายเหตุ/.test(n)));
const bad = _pSchedule(['รอบการรับสมัครของหลักสูตร | รอบ 1 | รอบ 2', 'สอบ | รอบ 1 x']);
check('a row with the wrong number of cells falls back to the full list', !bad.table && bad.list.length === 2);
check('cells are escaped', !_pSchedule(['รอบการรับสมัครของหลักสูตร | รอบ 1', '<img src=x> | รอบ 1 <b>']).table.includes('<img'));
check('the card no longer cuts the schedule at 8 lines', !/กำหนดการสอบคัดเลือก'\]\|\|\[\]\)\.filter\([^)]*\)\.slice\(0,8\)/.test(page));
check('the table scrolls sideways on a phone instead of breaking the bubble', /\.sched-wrap\{overflow-x:auto/.test(page));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
