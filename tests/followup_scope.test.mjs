// A follow-up ("แล้วค่าเทอมล่ะ") may use the remembered programme only when the question names no programme/field of its own.
// Run: node tests/followup_scope.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shippedWasm } from '../scripts/lib/chatbot_fns.mjs';
import { routeOf, decisionOf, catalogue } from '../scripts/lib/rust_route.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const bm = html.match(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/), lk = html.match(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/), td = html.match(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/);
const { resolveProgramme } = new Function('WASM', td[1] + lk[1] + '\n' + bm[1] + '\nreturn {resolveProgramme};')(shippedWasm());
// the follow-up decision is Rust's (plan 015 step 4c): with a programme card on screen, is this a follow-up about it, and which aspect
const card = catalogue.PROG.find(p => /จิตวิทยาคลินิก/.test(p.title));
const followUp = q => { const d = decisionOf(q, { programmeInFocus: card.code }); return d.route === 'followup' ? d.aspect : null; };
// the generic-fee decision is Rust's (plan 015 step 4b removed the page's isGenericFeeQuestion copy)
const isGenericFee = q => routeOf(q) === 'generic_fee';
const P = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')).programmes;
const own = ['ค่าเทอมสาธารณสุข', 'ทุนวิศวกรรม', 'แล้วทุนการพยาบาลล่ะ', 'สอบสัมภาษณ์วันไหน ทันตแพทย์'];
const plain = ['แล้วค่าเทอมล่ะ', 'มีทุนไหม', 'สมัครได้ถึงเมื่อไหร่', 'ค่าเทอมเท่าไร'];
check('questions naming their own field are detected (follow-up refused)', own.every(q => !followUp(q) && resolveProgramme(q, P, true)), own.filter(q => followUp(q) || !resolveProgramme(q, P, true)).join(','));
check('plain follow-ups still use the remembered programme', plain.every(q => followUp(q) && !resolveProgramme(q, P, true)), plain.filter(q => !followUp(q) || resolveProgramme(q, P, true)).join(','));
check('the page renders the programme and the aspect the router chose (no copy of the decision)', /const prog = _progView\(RUST_DETAIL\.programme, false\)/.test(html) && /const aspect = RUST_DETAIL\.aspect;/.test(html));
check('a picker (many / broad) clears the programme context', /a picker is on screen: a later/.test(html));
const gen = ['ค่าเทอมเท่าไร', 'ค่าเทอมปริญญาโท', 'ค่าเทอมทั่วไป', 'ค่าเล่าเรียนปริญญาเอกเท่าไหร่', 'ค่าเรียนกี่บาท'];
const named = ['ค่าเทอมพยาบาล', 'ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก', 'ค่าเทอม 2022M04G', 'ค่าสมัครเท่าไร', 'ค่าปรับส่งเล่ม'];
check('generic fee questions are recognised', gen.every(isGenericFee), gen.filter(q => !isGenericFee(q)).join(','));
check('fee questions that name a programme / other fee are not generic', named.every(q => !isGenericFee(q)), named.filter(isGenericFee).join(','));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
