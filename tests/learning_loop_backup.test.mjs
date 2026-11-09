// The Q&A backup diagram (docs/pitching/learning-loop-backup.html) must say only what the code does.
// Run: node tests/learning_loop_backup.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const page = read('docs/pitching/learning-loop-backup.html');
const text = page.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const worker = read('integrations/kernel-worker/worker.mjs'), chat = read('submissions/ui/chatbot.html'), deck = read('submissions/ui/pitch.html');
const BAN = [[/BLAKE3/i, 'BLAKE3'], [/EMA|σ|gate/i, 'jargon'], [/เรียนรู้เอง|ฉลาดขึ้นเอง|self-learning|ระบบจัดให้/i, 'learns-by-itself claim'],
  [/80\s*%/, 'the unmeasured 80%'], [/rebuild/i, 'automatic rebuild (approval publishes via /live-kb; a person files the KB entry)']];
for (const [re, label] of BAN) check(`backup page does not say: ${label}`, !re.test(text), (text.match(re) || [''])[0]);
check('approval publishes to the chat and can be retracted (worker has /kb-approve -> live, /live-kb, /kb-retract)',
  /status='live'/.test(worker) && /'\/live-kb'/.test(worker) && /'\/kb-retract'/.test(worker) && /ถอนออกได้/.test(text));
check('the KB file is written by a person, not the edge (kb-approve returns markdown, no repo write)',
  /We deliberately do\s*\/\/\s*NOT write to the repo/.test(worker) && /คนเป็นผู้บันทึก/.test(text));
check('👎 is shown as a list to check, not an automatic change (entry_conf only read by /entry-conf and federation preview)',
  /'\/entry-conf'/.test(worker) && /ไม่ได้เปลี่ยนคำตอบเอง/.test(text));
check('AI drafts wait for approval (kb_draft default status pending)', /status TEXT NOT NULL DEFAULT 'pending'/.test(worker) && /รออนุมัติ/.test(text));
check('gap logging masks email, phone, national id, ids (privacy note in chatbot.html)', /ซ่อนอีเมล เบอร์โทร เลขบัตร รหัส/.test(chat) && /ซ่อนอีเมล เบอร์โทร เลขบัตร รหัส/.test(text));
check('personal-data questions are refused and pointed to staff (chatbot.html personal* texts)', /personalSelf:/.test(chat) && /ติดต่อเจ้าหน้าที่/.test(chat) && /ติดต่อเจ้าหน้าที่/.test(text));
const secs = (deck.match(/ไม่เกินราว (\d+) วินาที/) || [])[1];
check(`the publish time matches the deck (${secs} s on slide 3)`, !!secs && text.includes(`ราว ${secs} วินาที`));
check('the not-built items are labelled as not done', /ยังไม่ได้ทำ/.test(text) && /\.plans\/008/.test(text));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
