// Answer-type note: the question asks for a kind of value (amount / duration / date / count) the entry text does not hold ->
// the answer still shows, with a note and a gap-log entry. Runs the real missingTypes() / typeMissNote() from chatbot.html.
// Needs knowledge-index.json for the real-entry checks.  Run: node tests/answer_type.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = html.match(/\/\/ <answer-type>[\s\S]*?\/\/ <\/answer-type>/)[0];
const F = new Function('isEnglish', '_lEsc', src + '\nreturn {missingTypes, typeMissNote};')(q => !/[฀-๿]/.test(q), s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const E = (answer, title = 'หัวข้อ') => ({ title, answer });
check('asks an amount, the entry has no amount -> money missing', F.missingTypes('ค่าตรวจบทคัดย่อเท่าไหร่', E('ส่งไฟล์ให้ศูนย์ภาษาทางระบบ')).join() === 'money');
check('asks an amount, the entry has one -> nothing missing', F.missingTypes('ค่าสมัครสอบเท่าไร', E('ครั้งละ 1,700 บาท')).length === 0);
check('asks a duration, the entry has days -> nothing missing', F.missingTypes('ตรวจกี่วัน', E('ภายใน 5 วันทำการ')).length === 0);
check('asks a date, the entry has a Thai month -> nothing missing', F.missingTypes('เปิดรับสมัครเมื่อไหร่', E('ตั้งแต่ 1 มิถุนายน 2569')).length === 0);
check('asks a date, the entry names none -> when missing', F.missingTypes('ต้องส่งเมื่อไหร่', E('ส่งผ่านระบบ e-Thesis')).join() === 'when');
check('a question that asks for no kind of value is never flagged', F.missingTypes('ขั้นตอนการลาพักทำอย่างไร', E('ยื่นคำร้อง')).length === 0);
check('two kinds asked, one held -> nothing missing (only flag when none is there)', F.missingTypes('ค่าธรรมเนียมเท่าไรและต้องจ่ายเมื่อไหร่', E('ครั้งละ 500 บาท')).length === 0);
check('English question gets an English note', /does not state the amount/.test(F.typeMissNote(E('send the file'), 'how much is the fee')));
check('Thai question gets a Thai note naming what is missing', /ไม่ได้ระบุจำนวนเงิน/.test(F.typeMissNote(E('ส่งไฟล์'), 'ค่าธรรมเนียมเท่าไร')));
check('a bare เท่าไร (a full score) is satisfied by any number: no "amount" note', F.missingTypes('คะแนนเต็มของการสอบเท่าไหร่', E('คะแนนเต็ม 100 คะแนน')).length === 0);
check('no note when nothing is missing', F.typeMissNote(E('500 บาท'), 'เท่าไร') === '');
check('the entry is still shown: kbBody keeps the answer and only prepends the note', /function kbBody\(hit, q\)\{ return validityTag\(hit\) \+ typeMissNote\(hit, q\) \+ kbBodyCore\(hit, q\); \}/.test(html));
check('a flagged act is written to the gap log', /if\(!pinned && missingTypes\(q, hit\)\.length\) logGap\(q\);/.test(html));
const idx = join(root, 'submissions/ui/knowledge-index.json');
if (existsSync(idx)) {
  const KB = JSON.parse(readFileSync(idx, 'utf8')), byId = Object.fromEntries(KB.map(e => [e.id, e]));
  check('real entry: TOEFL ITP fee question is not flagged (entry has the amount)', F.missingTypes('ค่าสมัครสอบ TOEFL ITP เท่าไร', byId['toefl_itp_fee'] || KB.find(e => /TOEFL ITP/.test(e.title) && /บาท/.test(e.answer))).length === 0);
  const flaggedTitles = KB.filter(e => F.missingTypes(e.title, e).length);
  check(`an entry's own title is rarely flagged against itself (<= 5% of ${KB.length})`, flaggedTitles.length <= KB.length * 0.05, `${flaggedTitles.length}: ${flaggedTitles.slice(0, 5).map(e => e.id).join(',')}`);
}
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
