// The not-found branch opens the programme finder only for real study questions or a misspelt programme name (QA F16):
// leave, grades, timetable, the admissions office, a canteen or a calendar are not programme questions.
// Run: node tests/not_found_gate.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const F = new Function(blk('today') + blk('linkify') + blk('programme-resolve') + '\nreturn {nearSpelling, hasStudyIntent, resolveProgramme};')();
const P = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')).programmes;
// the page's gate, same expression as the not-found branch of _askCore
const opensFinder = q => { const n = F.resolveProgramme(q, P, true); return F.hasStudyIntent(q) || !!(n && n.rows.some(p => F.nearSpelling(q, p.title) >= 0.8)); };
check('the page uses the same gate', /const nearOk = nearP && nearP\.rows\.some\(p=>nearSpelling\(q, p\.title\)>=0\.8\);\n    if\(PROG\.length && \(hasStudyIntent\(q\) \|\| nearOk\)\)\{/.test(html));
for (const q of ['เบอร์โทรฝ่ายรับสมัครอะไรคะ', 'ขอจบการศึกษายื่นยังไงคะ', 'ขอใบแสดงผลการเรียน', 'ขอต่อเวลาลาศึกษาต่อ', 'ปฏิทินการศึกษา', 'ภาพรวมการสมัคร', 'ชื่อบนใบปริญญาผิด', 'ระบบทวิภาคเรียนไม่ได้เหรอ', 'ผมเรียนระบบนี้ไม่ได้ต้องทำยังไง',
  'มีเรียนเสาร์อาทิตย์ไหม', 'ฝึกงาน', 'โรงอาหาร', 'ตารางเรียน', 'ขอพักเรียนปีนึงได้ไหม', 'อยากพักเรียนไปทำงานก่อนสักเทอม'])
  check(`"${q}" does not open the programme finder`, !opensFinder(q));
for (const q of ['กายอุปกณ์', 'จิตวิทยาคลินิค', 'กายภาพบำบัดด', 'พยาบาลศาตร์', 'อยากเรียนต่อโท', 'อยากเรียนกายอุปกณ์'])
  check(`"${q}" still opens the finder (study intent or a misspelt programme)`, opensFinder(q));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
