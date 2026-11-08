// Input that is not a question gets a short prompt (no "not in the knowledge base", no gap log); a question in a script the bot
// does not read is told in English it answers in Thai or English (QA F52). Checked on the Rust route (plan 015 step 3b): the
// reply lines and the gap log are checked by chat_e2e. Run: node tests/short_input.test.mjs
import { routeOf } from '../scripts/lib/rust_route.mjs';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const junk = ['ok', 'OK!', 'fuck you', 'a', 'k', '42', 'https://example.com'];
const real = ['What is the Turnitin limit?', 'GPA 3.5', 'Is tuition free?', 'e-Thesis login', 'How do I reset my password?', 'ส่งรูปเล่ม', 'MU GRAD Plus', 'ok ส่งเล่มกี่วัน'];
const other = ['你好，请问学费是多少', 'こんにちは、学費はいくらですか', '안녕하세요 등록금', 'Привет', 'مرحبا'];
check('F52: non-questions get the not-a-question route', junk.every(q => routeOf(q) === 'not_a_question'), junk.filter(q => routeOf(q) !== 'not_a_question').map(q => `${q}=${routeOf(q)}`).join(' | '));
check('F52: real questions do not', real.every(q => routeOf(q) !== 'not_a_question'), real.filter(q => routeOf(q) === 'not_a_question').join(' | '));
check('F52: other scripts get the other-script route', other.every(q => routeOf(q) === 'other_script'), other.filter(q => routeOf(q) !== 'other_script').map(q => `${q}=${routeOf(q)}`).join(' | '));
check('F52: Thai and English are not other-script', !['ค่าเทอม', 'fee', 'ok ค่ะ'].some(q => routeOf(q) === 'other_script'));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
