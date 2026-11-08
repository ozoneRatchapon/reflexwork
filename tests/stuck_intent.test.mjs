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
import { decisionOf } from '../scripts/lib/rust_route.mjs';
// Which message is a stuck message, which area it names and which entries it offers is Rust's since plan 015 step 4c (route/stuck.rs; the hand cases
// are in crates/reflex-wasm/tests/route_predicates.rs). Here: the router's decision, and the page's view of it.
const stuck = q => { const d = decisionOf(q); return d.route === 'stuck_pick' ? d.stuck : null; };
const bare = ['ติดปัญหา', 'ติดปัญหาครับ', 'ช่วยด้วย', 'งงมาก'];
check('a stuck message with no topic -> the area menu', bare.every(q => { const r = stuck(q); return r && r.key === null && r.areas.length > 0; }), bare.filter(q => { const r = stuck(q); return !(r && r.key === null); }).join(', '));
const area = { 'ติดปัญหาเรื่องวิทยานิพนธ์': 'thesis', 'ติดปัญหาจ่ายค่าเทอม': 'reg', 'ติดปัญหาเรื่องลาพัก': 'status', 'ติดปัญหาเรื่องขอจบ': 'grad' };
for (const [q, k] of Object.entries(area)) { const r = stuck(q); check(`"${q}" -> area ${k}, with entries`, r && r.key === k && r.picks.length > 0, JSON.stringify(r)); }
const leave = ['ติดปัญหาส่งเล่มเกินกำหนดต้องเสียค่าปรับไหม', 'ระบบลงทะเบียนมีปัญหา', 'เข้าระบบไม่ได้ ช่วยด้วย', 'ส่งรูปเล่มภายในกี่วัน'];
check('real questions and account / system problems are left to the normal path', leave.every(q => stuck(q) === null), leave.filter(q => stuck(q) !== null).join(', '));
const view = html.match(/const _STUCK_VIEW=\{[\s\S]*?\n\};/);
check('the page has a view (chip, name, question) for every area the router can name', !!view && ['login', 'reg', 'thesis', 'status', 'grad'].every(k => new RegExp(`\\b${k}:\\{key:'${k}', chip:'[^']+', name:'[^']+', asks:'[^']+'\\}`).test(view[0])));
check('the login chip asks the account intake phrase (IT contact box)', !!view && /login:\{[^}]*asks:'เข้าระบบไม่ได้'\}/.test(view[0]));

// wiring: after the kernel strip and the personal-record guard, before the broad-question chooser; never logs a gap
const at = html.indexOf("if(take('stuck_pick')){");
check('the branch runs after kstrip / the personal guard and before the restart / overview chooser', at > html.indexOf('const kstrip =') && at > html.indexOf("if(take('personal')){") && at < html.indexOf('isRestartPhrase(q);'));
const branch = html.slice(at, html.indexOf('isRestartPhrase(q);'));
check('the stuck branch does not log a gap or show the not-understood line', !/logGap|notUnderstood|frustratedNote/.test(branch));
check('the stuck branch always shows the staff contact', /_btn\(AGENCY\.contact\)/.test(branch));
check('the stuck branch offers a LINE chat with staff (agency config)', /_line\('general'\)/.test(branch));
check("another agency never gets the Graduate School's LINE (NEUTRAL_AGENCY.line is null)", /const NEUTRAL_AGENCY = \{[\s\S]*?line:null[\s\S]*?\n\};/.test(html));
check('the default LINE accounts are the ones on the official contact page', ['@gradmu', '@mugradmissions', '@322wjrbo'].every(id => html.includes(`https://line.me/R/ti/p/${id}`)));
check("the account / system box asks the Graduate School's own IT first, the university IT desk after it", /const itBtns = own \? _btn\(own\) \+ deskBtns/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
