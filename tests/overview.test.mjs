// Broad "what is interesting / what must I know" questions get starting points, not a guessed entry. Run: node tests/overview.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeOf } from '../scripts/lib/rust_route.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
// The decision is Rust's (route/branches.rs; plan 015 step 4b removed the page's isOverviewQuestion copy).
const yes = ['มีอะไรน่าสนใจ', 'มีอะไรน่าสนใจบ้าง', 'ต้องรู้อะไรบ้าง', 'ควรรู้อะไรบ้าง', 'น่าสนใจ', 'อะไรที่ต้องรู้', 'เริ่มต้นยังไง', 'what should I know'];
const no = ['ต้องรู้อะไรบ้างเกี่ยวกับการสมัครเรียนปริญญาโท วิศวกรรมชีวการแพทย์ ภาคปลาย ปี 2570', 'ค่าเทอมเท่าไร', 'ส่งวิทยานิพนธ์ต้องรู้อะไรบ้าง', 'ทุนอะไรน่าสนใจ', 'สวัสดี', ''];
const isOverview = q => routeOf(q) === 'overview';
check('broad questions detected', yes.every(isOverview), yes.filter(q => !isOverview(q)).join(','));
check('topic questions are left to search', no.every(q => !isOverview(q)), no.filter(isOverview).join(','));
const site = html.indexOf("take(['restart','overview'])");
check('branch runs after kstrip/d exist (it uses them) and before the programme path', site > 0 && site > html.indexOf('const kstrip =') && site < html.search(/(?:const|let) prog = /));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
