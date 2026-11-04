// Broad "what is interesting / what must I know" questions get starting points, not a guessed entry. Run: node tests/overview.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const m = html.match(/function isOverviewQuestion\(text\)\{[\s\S]*?\n\}\n/);
check('isOverviewQuestion found', m); if (!m) process.exit(1);
const f = new Function(m[0] + '\nreturn isOverviewQuestion;')();
const yes = ['มีอะไรน่าสนใจ', 'มีอะไรน่าสนใจบ้าง', 'ต้องรู้อะไรบ้าง', 'ควรรู้อะไรบ้าง', 'น่าสนใจ', 'อะไรที่ต้องรู้', 'เริ่มต้นยังไง', 'what should I know'];
const no = ['ต้องรู้อะไรบ้างเกี่ยวกับการสมัครเรียนปริญญาโท วิศวกรรมชีวการแพทย์ ภาคปลาย ปี 2570', 'ค่าเทอมเท่าไร', 'ส่งวิทยานิพนธ์ต้องรู้อะไรบ้าง', 'ทุนอะไรน่าสนใจ', 'สวัสดี', ''];
check('broad questions detected', yes.every(q => f(q)), yes.filter(q => !f(q)).join(','));
check('topic questions are left to search', no.every(q => !f(q)), no.filter(q => f(q)).join(','));
check('branch runs after kstrip/d exist (it uses them) and before the programme path', html.indexOf('isOverviewQuestion(q)') > 0 && html.indexOf('isOverviewQuestion(q)') > html.indexOf('const kstrip =') && html.indexOf('isOverviewQuestion(q)') < html.search(/(?:const|let) prog = \(pinned/));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
