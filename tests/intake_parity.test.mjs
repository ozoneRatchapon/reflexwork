// The web page and the LINE bot each carry a copy of the intake logic (classifyIssue, isAdvice). They must agree on every text of the
// golden contract (benchmark/golden/intake.json). Found 2026-11-03: LINE's login pattern lacked the `i` flag, so "LOGIN ไม่ได้" and
// "Password reset" went to the manual on LINE but to the staff intake on the web.
// Run: node tests/intake_parity.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyIssue, isAdvice } from '../integrations/_shared/intake.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cases = readFileSync(join(root, 'benchmark/golden/intake.json'), 'utf8').trim().split('\n').map(l => l.replace(/,$/, '')).filter(l => l.startsWith('{')).map(l => JSON.parse(l));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const issueDiff = cases.filter(c => (classifyIssue(c.text)?.category ?? null) !== (c.issue?.category ?? null));
const adviceDiff = cases.filter(c => isAdvice(c.text) !== c.advice);
check(`LINE classifyIssue agrees with the web on ${cases.length} texts`, issueDiff.length === 0, issueDiff.slice(0, 4).map(c => JSON.stringify(c.text)).join(' '));
check(`LINE isAdvice agrees with the web on ${cases.length} texts`, adviceDiff.length === 0, adviceDiff.slice(0, 4).map(c => JSON.stringify(c.text)).join(' '));
check('upper-case login problems are caught on LINE too', classifyIssue('LOGIN ไม่ได้')?.category === 'login' && classifyIssue('Password reset')?.category === 'login');
// QA G03: ordinary manual questions are not sent to the IT account box; real account/system problems still are (both copies)
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const web = new Function(page.match(/const _ISSUE_CATS=[\s\S]*?return null; \}\n/)[0] + 'return classifyIssue;')();
const notIssue = ['ถ้า reset ผลสอบได้ไหม', 'เลือกวันสอบไม่ได้ เพราะเต็ม', 'ผมเรียนระบบนี้ไม่ได้ต้องทำยังไง', 'ระบบทวิภาคเรียนไม่ได้เหรอ', 'ชื่อบนใบปริญญาผิด', 'Where can I obtain my Mahidol Internet Account?'];
const isIssue = [['ระบบลงทะเบียนมีปัญหา กดไม่ได้', 'system_error'], ['Password reset', 'login'], ['account ถูกล็อก', 'login'], ['reset รหัสผ่านยังไง', 'login'], ['เข้า account ไม่ได้', 'login'], ['ข้อมูลในระบบไม่อัปเดต', 'data_stuck']];
// QA F22: natural phrasings of account / stuck-data / frozen-system problems (were the generic not-found or an unrelated entry)
isIssue.push(['ไม่สามารถเข้าสู่ระบบได้', 'login'], ['ผมเข้าบัญชีมหิดลไม่ได้เลย', 'login'], ['เข้าระบบไม่ได้', 'login'], ['login ไม่ได้', 'login'],
  ['รหัสนักศึกษาไม่ขึ้น', 'data_stuck'], ['ข้อมูลหาย', 'data_stuck'], ['ผลสอบไม่ขึ้นในระบบ', 'data_stuck'], ['กดส่งแล้วไม่ไปไหน', 'system_error'], ['ระบบค้าง', 'system_error']);
notIssue.push('ผลสอบออกเมื่อไร', 'เกรดออกวันไหน', 'สามารถดาวน์โหลดรหัสเข้าระบบลงทะเบียน(Student ServiceSystem) ได้จากที่ไหน');
for (const [name, f] of [['web', web], ['LINE', classifyIssue]]) {
  check(`${name}: term-system, full-round, certificate-name and Internet Account questions are not account issues (G03)`, notIssue.every(q => f(q) === null), notIssue.filter(q => f(q)).join(' | '));
  check(`${name}: real login / system / stuck-data problems still go to staff`, isIssue.every(([q, c]) => f(q)?.category === c), isIssue.filter(([q, c]) => f(q)?.category !== c).map(([q]) => q).join(' | '));
}
// QA G01: the web chat keeps no intake state and sends nothing - it must not promise to collect or forward the details
check('web intake says it cannot send the details and offers a pre-filled e-mail instead (G01)', !/เก็บข้อมูลส่งต่อเจ้าหน้าที่ให้|→ ส่งต่อเจ้าหน้าที่ \$\{stageTag\}/.test(page) && /แชตนี้ส่งข้อมูลให้เจ้าหน้าที่เองไม่ได้/.test(page) && /mailto:account@mahidol\.ac\.th\?subject=/.test(page));
check('the IT box heading follows the category (a stuck record is not called a login problem)', /issue\.category==='login' \? 'ปัญหาบัญชี\/ล็อกอิน/.test(page));
// QA F22: on the web page a personal problem beats only the loose s<4 guess or a tie at the top, never a clear or staff answer
check('web: intake overrides only a weak or tied manual act (F22)', /if\(verdict\.action==='act' && top0 && \(top0\.s<4 \|\| tied0\) && !top0\.e\.staff && classifyIssue\(q\)\)/.test(page));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
