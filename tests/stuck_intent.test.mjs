// "ติดปัญหา" / "มีปัญหา" / "ช่วยด้วย" with no topic is a person who is stuck, not a miss: the page asks which area (problem-area chips +
// staff contact) instead of "จับใจความไม่ได้". "ติดปัญหา + one area word" opens that area's entries; a longer real question, and
// account / system problems (the IT intake), are left alone. Run: node tests/stuck_intent.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const grab = re => { const m = html.match(re); check(`found: ${re.source.slice(0, 40)}`, !!m); return m ? m[0] : ''; };
const intake = grab(/const _ISSUE_CATS=\[[\s\S]*?\nfunction classifyIssue\(text\)\{[\s\S]*?return null; \}/);
const stuck = grab(/const _STUCK_W=[\s\S]*?\nfunction stuckPicks\(c\)\{[\s\S]*?\n\}\n/);
if (!intake || !stuck) process.exit(1);
const { stuckTopic, stuckPicks, _STUCK_CATS } = new Function('KB', 'search', intake + stuck + '\nreturn { stuckTopic, stuckPicks, _STUCK_CATS };')([], () => []);

const bare = ['ติดปัญหา', 'ติดปัญหาค่ะ', 'ติดปัญหาครับ', 'ผมติดปัญหาครับ', 'มีปัญหา', 'มีปัญหาค่ะ', 'ช่วยด้วย', 'ช่วยด้วยครับ', 'ช่วยหน่อย', 'ขอความช่วยเหลือ', 'ไม่รู้จะทำยังไงดี', 'ทำยังไงดี', 'งงมาก', 'ติด ปัญหา'];
check('a stuck message with no topic -> the area menu', bare.every(q => { const r = stuckTopic(q); return r && r.cat === null; }), bare.filter(q => { const r = stuckTopic(q); return !(r && r.cat === null); }).join(', '));
const area = { 'ติดปัญหาวิทยานิพนธ์': 'thesis', 'ติดปัญหาเรื่องวิทยานิพนธ์': 'thesis', 'มีปัญหาเรื่องส่งเล่ม': 'thesis', 'ติดปัญหา Turnitin': 'thesis',
  'ติดปัญหาเรื่องลงทะเบียน': 'reg', 'ติดปัญหาจ่ายค่าเทอม': 'reg', 'ลงทะเบียนมีปัญหาครับ': 'reg', 'ติดปัญหาการชำระเงิน': 'reg',
  'ติดปัญหาเรื่องลาพัก': 'status', 'มีปัญหาเรื่องลาออก': 'status', 'ติดปัญหาเรื่องขอจบ': 'grad', 'ติดปัญหาเรื่องเอกสาร': 'grad' };
for (const [q, k] of Object.entries(area)) { const r = stuckTopic(q); check(`"${q}" -> area ${k}`, r && r.cat && r.cat.key === k, JSON.stringify(r && r.cat && r.cat.key)); }
const leave = ['ติดปัญหาส่งเล่มเกินกำหนดต้องเสียค่าปรับไหม', 'ติดปัญหาเข้าระบบไม่ได้', 'ระบบลงทะเบียนมีปัญหา', 'เข้าระบบไม่ได้ ช่วยด้วย', 'ช่วยแนะนำวิธีจัดการเวลาทำวิทยานิพนธ์',
  'ส่งรูปเล่มภายในกี่วัน', 'ติดปัญหาเรื่องที่จอดรถ', 'ปัญหาพิเศษคืออะไร', 'อยากลาพักการศึกษา ควรทำยังไง', 'ok', ''];
check('real questions, account / system problems and other topics are left to the normal path', leave.every(q => stuckTopic(q) === null), leave.filter(q => stuckTopic(q) !== null).join(', '));
check('the login chip asks the account intake phrase (IT contact box)', _STUCK_CATS.find(c => c.key === 'login').asks === 'เข้าระบบไม่ได้');

// chips come from the KB: a seed's top entry counts only if its title is in the area; a KB without the area offers nothing
const thesis = _STUCK_CATS.find(c => c.key === 'thesis');
const fakeHit = t => ({ e: { id: t, title: t }, s: 6 });
const picks = new Function('KB', 'search', intake + stuck + '\nreturn stuckPicks;')([], s => [fakeHit(/Turnitin/.test(s) ? 'Turnitin เกิน 25% ต้องทำอย่างไร' : 'ทุนการศึกษามีอะไรบ้าง')]);
check('an off-area top hit is not offered as a chip', picks(thesis).length === 1 && picks(thesis)[0].title.startsWith('Turnitin'), JSON.stringify(picks(thesis)));
check('an empty KB offers no chips for the area', stuckPicks(thesis).length === 0);

// wiring: after the kernel strip and the personal-record guard, before the broad-question chooser; never logs a gap
const at = html.indexOf('stuckTopic(q)');
check('the branch runs after kstrip / personalAsk and before the restart / overview chooser', at > html.indexOf('const kstrip =') && at > html.indexOf('personalAsk(q)') && at < html.indexOf('isRestartPhrase(q);'));
const branch = html.slice(at, html.indexOf('isRestartPhrase(q);'));
check('the stuck branch does not log a gap or show the not-understood line', !/logGap|notUnderstood|frustratedNote/.test(branch));
check('the stuck branch always shows the staff contact', /_btn\(AGENCY\.contact\)/.test(branch));
check('the stuck branch offers a LINE chat with staff (agency config)', /_line\('general'\)/.test(branch));
check("another agency never gets the Graduate School's LINE (NEUTRAL_AGENCY.line is null)", /const NEUTRAL_AGENCY = \{[\s\S]*?line:null[\s\S]*?\n\};/.test(html));
check('the default LINE accounts are the ones on the official contact page', ['@gradmu', '@mugradmissions', '@322wjrbo'].every(id => html.includes(`https://line.me/R/ti/p/${id}`)));
check("the account / system box asks the Graduate School's own IT first, the university IT desk after it", /const itBtns = own \? _btn\(own\) \+ deskBtns/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
