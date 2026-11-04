// Input that is not a question gets a short prompt (no "not in the knowledge base", no gap log); a question in a script the bot
// does not read is told in English it answers in Thai or English (QA F52).   Run: node tests/short_input.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const h = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const { isNotAQuestion, isOtherScript } = new Function(h.slice(h.indexOf('const _P_ACK='), h.indexOf('function isEnglish(q){')) + 'return {isNotAQuestion, isOtherScript};')();
const junk = ['ok', 'OK!', 'fuck you', 'a', 'k', '42', 'https://example.com'];
const real = ['What is the Turnitin limit?', 'GPA 3.5', 'Is tuition free?', 'e-Thesis login', 'How do I reset my password?', 'ส่งรูปเล่ม', 'MU GRAD Plus', 'ok ส่งเล่มกี่วัน'];
const other = ['你好，请问学费是多少', 'こんにちは、学費はいくらですか', '안녕하세요 등록금', 'Привет', 'مرحبا'];
check('F52: non-questions are recognised', junk.every(isNotAQuestion), junk.filter(q => !isNotAQuestion(q)).join(' | '));
check('F52: real questions are not', !real.some(isNotAQuestion), real.filter(isNotAQuestion).join(' | '));
check('F52: other scripts are recognised and are not "not a question"', other.every(isOtherScript) && !other.some(isNotAQuestion), other.filter(q => !isOtherScript(q) || isNotAQuestion(q)).join(' | '));
check('F52: Thai and English are not "other script"', !['ค่าเทอม', 'fee', 'ok ค่ะ'].some(isOtherScript));
const br = h.slice(h.indexOf('    if(isNotAQuestion(q)){'), h.indexOf('    if(isEnglish(q)){'));
check('F52: a non-question is not logged and not counted as a hand-off', /ai--;/.test(br.split('if(isOtherScript(q))')[0]) && !/logGap/.test(br.split('if(isOtherScript(q))')[0]));
check('F52: an other-script question gets the English line and the staff contact', /Sorry, I can answer in Thai or English only/.test(br) && /_btn\(\(AGENCY\.english\|\|\{\}\)\.contact \|\| AGENCY\.contact\)/.test(br));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
