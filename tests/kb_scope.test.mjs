// Scope guard (year/semester) in submissions/ui/chatbot.html.
// Run: node tests/kb_scope.test.mjs   (exit 0 = pass, 1 = fail)
//
// Several KB entries answer the same question for different academic years /
// semesters. Without a guard a keyword tie silently picks one year. We EXTRACT the
// real scopeOf()/scopeClarify() and search() (Rust kb_search) from the HTML so the test
// exercises production code. Needs the generated knowledge-index.json.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch } from '../scripts/lib/chatbot_fns.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const idxPath = join(root, 'submissions/ui/knowledge-index.json');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

if (!existsSync(idxPath)) { console.log('⚠ knowledge-index.json not present — run build_knowledge_index.py. Skipping.'); process.exit(0); }
const KB = JSON.parse(readFileSync(idxPath, 'utf8'));

const cm = html.match(/\/\/ <scope-clarify>([\s\S]*?)\/\/ <\/scope-clarify>/);
check('scope-clarify block found', cm);
if (!cm) process.exit(1);
const search = pageSearch(KB, html);
const { scopeOf, scopeClarify, ceNote, normTermYear } = new Function(cm[1] + '\nreturn {scopeOf, scopeClarify, ceNote, normTermYear};')();

const run = q => scopeClarify(q, search(q), KB);
const ids = r => (r && r.candidates || []).map(e => e.id);

// --- scopeOf -----------------------------------------------------------------
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
eq('BE year + term', scopeOf('ลงทะเบียนภาคปลาย ปี 2569'), { year: '2569', term: 'ภาคปลาย' });
eq('Thai digits', scopeOf('ภาคต้น ๒๕๗๐'), { year: '2570', term: 'ภาคต้น' });
eq('CE year converted to BE', scopeOf('ภาคปลาย 2026 ลงทะเบียน'), { year: '2569', term: 'ภาคปลาย' });
eq('CE summer is the calendar year: summer 2027 = May 2027 = ฤดูร้อน 2569 (G18)', scopeOf('registration 2027 summer'), { year: '2569', term: 'ฤดูร้อน' });
eq('summer 2026 = academic year 2568 (no data -> the no-year guard)', scopeOf('ลงทะเบียนภาคฤดูร้อน 2026 ได้เมื่อไหร่'), { year: '2568', term: 'ฤดูร้อน' });
check('CE echo explains the summer shift', /อ่าน 2026 เป็นปี ค\.ศ\. ตรงกับปีการศึกษา 2568 เพราะภาคฤดูร้อน/.test(ceNote('ฤดูร้อน 2026', '2568')) && ceNote('ฤดูร้อน 2569', '2569') === '');
eq('an explicit CE academic year is not shifted', scopeOf('ฤดูร้อน ปีการศึกษา 2026'), { year: '2569', term: 'ฤดูร้อน' });
eq('money is not a year', scopeOf('ค่าสมัคร 2000 บาท'), { year: '', term: '' });
eq('regulation year is not an academic year', scopeOf('เกณฑ์ 2560 ลงทะเบียน'), { year: '', term: '' });
eq('no scope', scopeOf('ส่งเล่มกี่วัน'), { year: '', term: '' });

// --- the bug: ambiguous year must ask, not guess ----------------------------------
const a1 = run('ลงทะเบียนภาคปลายวันไหน');
check('no year → asks which year', a1 && a1.kind === 'ask' && a1.axis === 'year', JSON.stringify(a1 && { k: a1.kind, a: a1.axis }));
check('…offers both 2569 and 2570 second-semester', ids(a1).includes('gm_registration_2569_second_semester') && ids(a1).includes('gm_registration_2570_second'), ids(a1).join());
check('…no off-topic entry among the options', !ids(a1).includes('gm_registration_exemption_2570'), ids(a1).join());
const a2 = run('ลงทะเบียนภาคต้นวันไหน');
check('first semester, no year → asks year', a2 && a2.kind === 'ask', JSON.stringify(a2 && a2.kind));

// --- user supplied the scope: answer that one, no question ---------------------------
const p1 = run('ลงทะเบียนภาคปลาย ปี 2569 วันไหน');
const final1 = !p1 ? search('ลงทะเบียนภาคปลาย ปี 2569 วันไหน')[0].e : p1.kind === 'pick' ? p1.entry : null;
check('year+term given → resolves to 2569 second semester', final1 && final1.id === 'gm_registration_2569_second_semester', p1 ? JSON.stringify(p1.kind) : 'null→' + (final1 && final1.id));
const p2 = run('ลงทะเบียนภาคต้นปี 2570 วันไหน');
const final2 = !p2 ? search('ลงทะเบียนภาคต้นปี 2570 วันไหน')[0].e : p2.kind === 'pick' ? p2.entry : null;
check('2570 first semester resolves', final2 && final2.id === 'gm_registration_2570_first', p2 ? p2.kind : 'null→' + (final2 && final2.id));

// --- year with no data: say so, never substitute -------------------------------------
const n1 = run('ลงทะเบียนภาคปลาย ปี 2571 วันไหน');
check('unknown year → no_year', n1 && n1.kind === 'no_year' && n1.year === '2571', JSON.stringify(n1 && n1.kind));
check('…lists the years we do have', n1 && n1.years.includes('2569') && n1.years.includes('2570'), JSON.stringify(n1 && n1.years));

// --- no false alarms on undated topics -----------------------------------------------
for (const q of ['ส่งเล่มวิทยานิพนธ์ช้าสุดกี่วัน', 'ลาพักการศึกษาต้องทำอย่างไร', 'ทุนการศึกษามีอะไรบ้าง', 'วันนี้อากาศเป็นยังไง']) {
  const r = run(q);
  check(`undated topic untouched: ${q}`, r === null, JSON.stringify(r && r.kind));
}

// --- chip round-trip: clicking an option's title must resolve to THAT entry, never re-ask ---
const dated = KB.filter(e => e.academic_year && e.semester && e.category === 'registration');
check('registration schedule entries exist', dated.length >= 6, String(dated.length));
for (const e of dated) {
  const r = run(e.title), top = search(e.title)[0].e;
  const final = r && r.kind === 'pick' ? r.entry : r === null ? top : null;
  check(`chip resolves: ${e.id}`, final && final.id === e.id, r ? r.kind : `top=${top.id}`);
}

// --- term/year shorthand (F14): the page runs normTermYear before search and the guard
const runN = q => { const n = normTermYear(q); return { n, top: search(n)[0], c: scopeClarify(n, search(n), KB) }; };
const lands = (q, id) => { const { top, c } = runN(q); const got = c && c.kind === 'pick' ? c.entry.id : c ? c.kind : top && top.e.id; check(`"${q}" -> ${id}`, got === id, `got ${got}`); };
lands('ลงทะเบียนเรียนเทอมแรกปี 69 เมื่อไหร่ค่ะ', 'gm_registration_2569');
lands('ซัมเมอร์ปี 69 ลงทะเบียนเมื่อไหร่คะ', 'gm_registration_2569_summer');
lands('เทอมสองปี 70 ลงทะเบียนเมื่อไหร่', 'gm_registration_2570_second');
lands('ลงทะเบียนเทอม 1/2569', 'gm_registration_2569');
lands('ลงทะเบียนเทอม 1 ปี 2570', 'gm_registration_2570_first');
lands('ลงทะเบียนภาค 2/69', 'gm_registration_2569_second_semester');
{ const { c } = runN('ลงทะเบียนซัมเมอร์'); check('"ลงทะเบียนซัมเมอร์" asks between the two summers', c && c.kind === 'ask' && ids(c).join() === 'gm_registration_2569_summer,gm_registration_2570_summer', ids(c).join()); }
{ const { c } = runN('ลงทะเบียนเมื่อไหร่'); check('"ลงทะเบียนเมื่อไหร่" lists all 6 schedules in calendar order', c && c.kind === 'ask' && ids(c).length === 6 && ids(c)[0] === 'gm_registration_2569', ids(c).join()); }
{ const { c } = runN('ลงทะเบียนภาคต้น 2569 และ 2570 ต่างกันยังไง'); check('two years named -> both offered, not the first only', c && c.kind === 'ask' && ids(c).join() === 'gm_registration_2569,gm_registration_2570_first', ids(c).join()); }
check('"ค่าเทอม 1 ภาค" is a fee, untouched', normTermYear('ค่าเทอม 1 ภาคเท่าไร') === 'ค่าเทอม 1 ภาคเท่าไร');
check('text without schedule words is untouched', normTermYear('ปี 69 สมัครได้ไหม') === 'ปี 69 สมัครได้ไหม');
// --- admission round (F15)
{ const c = run('รับสมัครรอบ 2 ปี 2570'); check('"รับสมัครรอบ 2" -> no_round (the manual has round 1 only)', c && c.kind === 'no_round' && c.round === '2' && c.rounds.join() === '1', JSON.stringify(c && { k: c.kind, r: c.round })); }
{ const c = run('รับสมัครปี 70 รอบแรกวันไหนคะ'.replace('ปี 70', 'ปี 2570')); check('"รอบแรก" is round 1 -> not no_round', !c || c.kind !== 'no_round'); }
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
