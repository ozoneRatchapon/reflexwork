// "Is studying free?" is never confirmed, however it is phrased (QA F23). Checked on the Rust route (plan 015 step 3b):
// the free-study route is picked for every phrasing, and for no unrelated question. The reply's wording and its place in the
// page's order are checked by chat_e2e and route_golden (shadow mode), not here.   Run: node tests/fee_premise.test.mjs
import { routeOf } from '../scripts/lib/rust_route.mjs';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const yes = ['ปริญญาโทเรียนฟรีจริงไหม', 'เรียนฟรีหรือเปล่า', 'มีเรียนฟรีไหม', 'is tuition free?', 'Is the master program free?', 'ป.โทฟรีไหม', 'ไม่เสียค่าเรียนใช่ไหม'];
const no = ['ส่งรูปเล่มภายในกี่วัน', 'free parking near campus', 'ฟรีวีซ่าไหม', 'Turnitin เกิน 25% ทำอย่างไร', 'เรียนไรดี'];
check('F23: free-study phrasings get the free-study route', yes.every(q => routeOf(q) === 'free_study'), yes.filter(q => routeOf(q) !== 'free_study').map(q => `${q}=${routeOf(q)}`).join(' | '));
check('F23: unrelated questions do not', no.every(q => routeOf(q) !== 'free_study'), no.filter(q => routeOf(q) === 'free_study').join(' | '));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
