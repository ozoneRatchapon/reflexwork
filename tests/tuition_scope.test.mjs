// The "nothing in the manual matched" fallback opens the TUITION finder only for tuition questions; exam / service / procurement fees
// do not (found by benchmark/rules/branch_hits.mjs, 002). Runs the real isTuitionQuestion() from chatbot.html.
// Run: node tests/tuition_scope.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = 'const _P_TOPIC=[["fee",' + html.match(/^const _P_TOPIC=\[\['fee',(\/.*?\/i)\]/m)[1] + ']];\n' + html.match(/^const _P_TUITION=.*$/m)[0] + '\n' + html.match(/^const _P_NONTUITION=.*$/m)[0] + '\n' + html.match(/^function isTuitionQuestion[\s\S]*?\n\}\n/m)[0];
const isTuitionQuestion = new Function(src + 'return isTuitionQuestion;')();
for (const q of ['ค่าเทอมเท่าไหร่', 'อยากรู้ว่าค่าเทอมที่นี่เป็นยังไงบ้าง', 'ค่าเล่าเรียนปริญญาโท', 'tuition fee', 'how much is the fee', 'ค่าธรรมเนียมเท่าไร', 'ค่าใช้จ่ายเท่าไหร่', 'what is the fee for the nursing programme'])
  check(`tuition: "${q}"`, isTuitionQuestion(q));
for (const q of ['What is the fee for taking the TOEFL ITP?', 'What are the MU GRAD Plus examination fees?',
  'ค่าใช้จ่ายอื่นๆ ที่มาพร้อมกับการซื้อวัสดุหรือจ้าง เช่น ค่าขนส่ง ประกัน ภาษี สามารถเบิกผ่านได้ไหม', 'ค่าธรรมเนียมการโอนเงินต่างธนาคาร', 'ค่าสมัครสอบ TOEFL'])
  check(`not tuition: "${q.slice(0, 50)}"`, !isTuitionQuestion(q));
check('the no-match fallback and the field fee finder both use it', /if\(PROG\.length && isTuitionQuestion\(q\)\)\{/.test(html) && /PROG\.length && isTuitionQuestion\(q\) && !_P_FREEQ\.test\(q\)\)\{/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
