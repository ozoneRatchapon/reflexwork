// Crisis / distress phrases get a caring reply (not the cold not-found); ordinary questions are untouched. Run: node tests/wellbeing.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const m = html.match(/function wellbeingKind\(text\)\{[\s\S]*?\n\}\n/);
check('wellbeingKind found', m); if (!m) process.exit(1);
const wellbeingKind = new Function(m[0] + '\nreturn wellbeingKind;')();
const crisis = ['อยากฆ่าตัวตาย', 'โดนล่วงละเมิด', 'ทำร้ายตัวเอง'];
const stress = ['ฉันซึมเศร้า', 'เครียดมาก ทำไงดี', 'เรียนไม่ไหวทำไงดี', 'เหนื่อยจัง ท้อมาก อยากเลิกเรียน'];
const normal = ['ค่าเทอมเท่าไร', 'ท้องฟ้า', 'เว็บโหลดไม่ไหว', 'ลงทะเบียนเรียนวิชา GRID', 'สวัสดี', 'ส่งเล่มวิทยานิพนธ์กี่วัน'];
check('crisis phrases', crisis.every(q => wellbeingKind(q) === 'crisis'), crisis.filter(q => wellbeingKind(q) !== 'crisis').join(','));
check('distress phrases', stress.every(q => wellbeingKind(q) === 'stress'), stress.filter(q => wellbeingKind(q) !== 'stress').join(','));
check('ordinary questions untouched', normal.every(q => wellbeingKind(q) === null), normal.filter(q => wellbeingKind(q)).join(','));
check('branch runs before smalltalk and shows the counselling entry', html.indexOf('wellbeingKind(q)') < html.indexOf('classifySmalltalk(q);') && html.includes("gm_mental_wellbeing_navigation"));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
