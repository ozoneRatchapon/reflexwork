// The same Thai question typed with different code points reads the same (QA G27).   Run: node tests/normalize_variants.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
const { normChat } = new Function(html.match(/\/\/ <chat-normalize>([\s\S]*?)\/\/ <\/chat-normalize>/)[1] + ';return {normChat};')();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const same = [
  ['sara am typed as nikhahit + sara aa', 'ล่มทําอย่างไร', 'ล่มทำอย่างไร'],
  ['tone mark typed before the vowel', 'ต้องมีก่ีบท', 'ต้องมีกี่บท'],
  ['tone between nikhahit and sara aa', 'นํ้า', 'น้ำ'],
  ['tone then nikhahit + sara aa', 'น้ํา', 'น้ำ'],
  ['word joiner U+2060', 'ส่ง⁠รูปเล่ม', 'ส่งรูปเล่ม'],
  ['soft hyphen', 'ส่ง­รูปเล่ม', 'ส่งรูปเล่ม'],
  ['bidi marks', '‎ส่งรูปเล่ม‏', 'ส่งรูปเล่ม'],
  ['zero-width joiner', 'ทุน‍การศึกษา', 'ทุนการศึกษา'],
];
for (const [name, a, b] of same) check(`G27: ${name}`, normChat(a) === normChat(b) && normChat(a) === b, JSON.stringify(normChat(a)));
check('correct Thai is unchanged', ['น้ำ', 'กี่วัน', 'ทำอย่างไร', 'ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก'].every(t => normChat(t) === t));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
