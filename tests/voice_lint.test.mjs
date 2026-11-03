// The words a student reads (VOICE in submissions/ui/chatbot.html) must stay plain, polite and conversational.
// This is a floor, not a style guide: it catches engineering words and stiff officialese. Run: node tests/voice_lint.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const m = html.match(/const VOICE = (\{[\s\S]*?\n\});/);
check('VOICE block found in the page', !!m); if (!m) process.exit(1);
const VOICE = new Function('return ' + m[1])();
const keys = Object.keys(VOICE);
check('VOICE has the strings the page relies on', ['notUnderstood', 'notInManual', 'staffHelp', 'feePremise', 'careerIntro', 'frustrated', 'adviceAbstain', 'unsureProgramme', 'askYearTerm', 'nearest'].every(k => keys.includes(k)), keys.join(','));
const JARGON = /\b(KB|kernel|escalat\w*|score|fingerprint|BLAKE3|deterministic|ground\w*|token|WASM|gate|rethink|FastPath|LLM)\b|ขั้นคัดกรอง|คะแนนความมั่นใจ|ลายนิ้วมือ/i;
const STIFF = /ดังกล่าว|ทั้งนี้|โปรดดำเนินการ|ขอให้ท่าน|ท่านสามารถ|ประสงค์|อนึ่ง|ตามที่ระบุ/;
for (const [k, v] of Object.entries(VOICE)) {
  check(`${k}: no engineering words`, !JARGON.test(v), (v.match(JARGON) || [])[0]);
  check(`${k}: no stiff officialese`, !STIFF.test(v), (v.match(STIFF) || [])[0]);
  check(`${k}: one idea at a time (<= 170 characters)`, v.length <= 170, `${v.length} chars`);
}
// strings that live inside the standalone-evaluated programme-resolver block (no VOICE there): lint them where they are
const finder = (html.match(/out\.push\('<small>([^<]+)<\/small>'\);/) || [])[1];
check('finder footnote found', !!finder);
if (finder) { check('finder footnote: no engineering words', !JARGON.test(finder)); check('finder footnote: no stiff officialese', !STIFF.test(finder)); check('finder footnote: polite particle', /ครับ/.test(finder)); }
const must = ['notUnderstood', 'notInManual', 'staffHelp', 'unsureProgramme', 'askYearTerm', 'frustrated', 'adviceAbstain', 'feePremise'];
for (const k of must) check(`${k}: polite particle present (ครับ / นะครับ)`, /ครับ/.test(VOICE[k]), VOICE[k]);
check('every apology/failure message tells the student what to do next', ['notUnderstood', 'staffHelp', 'frustrated', 'adviceAbstain', 'unsureProgramme', 'feePremise'].every(k => /ลอง|ติดต่อ|เลือก|พิมพ์|กด/.test(VOICE[k])));
check('the bot speaks as "ผม" (one consistent persona)', Object.values(VOICE).every(v => !/\bดิฉัน|\bหนู(?!ไม่)|ค่ะ/.test(v)));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
