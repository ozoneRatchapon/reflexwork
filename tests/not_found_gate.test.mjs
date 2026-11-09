// The not-found branch opens the programme finder only for real study questions or a misspelt programme name (QA F16):
// leave, grades, timetable, the admissions office, a canteen or a calendar are not programme questions.
// Checked on the Rust route (plan 015 step 3b). Run: node tests/not_found_gate.test.mjs
import { routeOf } from '../scripts/lib/rust_route.mjs';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const PICKER = ['finder', 'programme_pick', 'unsure_programme'];
const NOT_PROGRAMME = ['เบอร์โทรฝ่ายรับสมัครอะไรคะ', 'ขอจบการศึกษายื่นยังไงคะ', 'ขอใบแสดงผลการเรียน', 'ขอต่อเวลาลาศึกษาต่อ', 'ปฏิทินการศึกษา', 'ภาพรวมการสมัคร', 'ชื่อบนใบปริญญาผิด', 'ระบบทวิภาคเรียนไม่ได้เหรอ', 'ผมเรียนระบบนี้ไม่ได้ต้องทำยังไง',
  'มีเรียนเสาร์อาทิตย์ไหม', 'ฝึกงาน', 'โรงอาหาร', 'ตารางเรียน', 'ขอพักเรียนปีนึงได้ไหม', 'อยากพักเรียนไปทำงานก่อนสักเทอม'];
const MISSPELT = ['กายอุปกณ์', 'จิตวิทยาคลินิค', 'กายภาพบำบัดด', 'พยาบาลศาตร์', 'อยากเรียนกายอุปกณ์'];
check('not a programme question: no picker route', NOT_PROGRAMME.every(q => !PICKER.includes(routeOf(q))), NOT_PROGRAMME.filter(q => PICKER.includes(routeOf(q))).map(q => `${q}=${routeOf(q)}`).join(' | '));
// a misspelt name is answered, never dropped to not-found: the picker, or the one card when the Rust resolver finds a single near match
check('a misspelt programme name gets an answer (picker or card)', MISSPELT.every(q => routeOf(q) !== null), MISSPELT.filter(q => routeOf(q) === null).join(' | '));
// study intent with no programme name: the KB answers it (kb_act) or the picker opens; it must never end in not-found
check('"อยากเรียนต่อโท" gets an answer (not not-found)', routeOf('อยากเรียนต่อโท') !== null, `route ${routeOf('อยากเรียนต่อโท')}`);
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
