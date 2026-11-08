// A question that asks for ONE PERSON'S record ("my grade", "what do I owe", "my friend's status") gets an honest boundary + a way to look it
// up, never a general entry that reads like their answer; how-to and eligibility questions are not touched.   Run: node tests/personal_boundary.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), R = f => readFileSync(join(root, f), 'utf8');
const h = R('submissions/ui/chatbot.html');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = h.slice(h.indexOf('const _PERS_RECORD='), h.indexOf('function isEnglish(q){'));
const personalAsk = new Function(src + '\nreturn personalAsk;')();

const self = ['ผลสอบของฉันออกหรือยัง', 'เกรดของผมเท่าไร', 'ค่าเทอมที่ผมค้างจ่ายเท่าไร', 'สถานะคำร้องบฑ.1 ของฉัน', 'อาจารย์ที่ปรึกษาของผมคือใคร', 'ผมสอบผ่านหรือยัง', 'ผมจบหรือยัง', 'ยอดค้างชำระของหนูเท่าไหร่', 'ผมได้ทุนไหม'];
const other = ['ขอดูข้อมูลของเพื่อนผมหน่อย รหัส 6537001', 'เพื่อนผมสอบผ่านหรือยัง', 'ขอดูผลสอบรหัส 6537001', 'เกรดของน้องผมเท่าไร', 'สถานะคำร้องของแฟนผม'];
const general = ['ผมสอบผ่านแล้วต้องทำอะไรต่อ', 'ผมจะดูเกรดได้ที่ไหน', 'ผมต้องส่งรูปเล่มภายในกี่วัน', 'ผมค้างจ่ายค่าเทอมต้องทำอย่างไร', 'เกรดต่ำสุดที่ผ่านคือเท่าไร', 'ผลสอบออกเมื่อไร', 'ผมขอทุนได้ไหม',
  'ขั้นตอนการยื่นคำร้องของผม', 'เพื่อนผมต้องส่งรูปเล่มกี่วัน', 'ผมอยากสมัครเรียนจิตวิทยาคลินิก', 'ค่าเทอมเท่าไร', 'ผมเข้าระบบไม่ได้', 'Turnitin เกิน 25% ทำอย่างไร', 'สถานะการรับสมัครของหลักสูตรนี้', 'ถ้าผมสอบไม่ผ่านจะทำอย่างไร'];
check('self record lookups are recognised', self.every(q => personalAsk(q) === 'self'), self.filter(q => personalAsk(q) !== 'self').join(' | '));
check("someone else's record (friend, child, an id) is recognised", other.every(q => personalAsk(q) === 'other'), other.filter(q => personalAsk(q) !== 'other').join(' | '));
check('how-to / eligibility / general questions with a pronoun are NOT personal lookups', general.every(q => personalAsk(q) === null), general.filter(q => personalAsk(q) !== null).map(q => q + '=' + personalAsk(q)).join(' | '));

// no known question may be diverted: manual titles, official FAQ (Thai + English), beginner and odd questions, every programme name
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), P = JSON.parse(R('submissions/ui/programmes.json')).programmes;
const faq = JSON.parse(R('benchmark/field/faq_questions.json')).items.flatMap(i => [i.th, i.en]).filter(Boolean);
const beg = R('benchmark/coverage/beginner_questions.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const odd = JSON.parse(R('benchmark/odd/odd_questions.json')); const oddQ = (Array.isArray(odd) ? odd : odd.items || odd.questions || []).map(x => typeof x === 'string' ? x : x.q || x.question).filter(Boolean);
const all = [...new Set([...KB.map(e => e.title), ...faq, ...beg, ...oddQ, ...P.flatMap(p => [p.title, 'สมัคร ' + p.title, 'ค่าเทอม ' + p.title])])];
const hit = all.filter(q => personalAsk(q));
check(`none of ${all.length} known questions (manual, FAQ, beginner, odd, programmes) is diverted`, hit.length === 0, hit.slice(0, 5).join(' | '));

// wiring
const i = h.indexOf('const pers = pinned ? null : personalAsk(q);'), blk = h.slice(i, h.indexOf('const restart = isRestartPhrase(q);', i));
check('the boundary runs before the programme, fee and knowledge-base paths', i > 0 && i < h.search(/(?:const|let) prog = /) && i < h.indexOf('const _pre = ') && i < h.indexOf("take('generic_fee')"));
check('it is never logged as a gap, never counted as answered / not-found, and never calls the AI', !/logGap|auto\+\+|ai\+\+|groundedHybrid|rewriteQuery/.test(blk));
check('it points to a way to look the data up (staff contact; e-Thesis for thesis questions)', /_btn\(AGENCY\.contact\)/.test(blk) && /id==='ethesis'/.test(blk));
check('general topics offered under it are labelled as not the person\'s own', /VOICE\.personalGeneral/.test(blk) && /ไม่ใช่ของคุณ/.test(h.match(/personalGeneral:[^\n]*/)[0]));
check('a friend\'s record gets a refusal that says to ask the owner, without general topics', /pers==='other' \? VOICE\.personalOther/.test(blk) && /gen = pers==='self' \?/.test(blk) && /ให้เจ้าของข้อมูลมาถามเอง/.test(h));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
