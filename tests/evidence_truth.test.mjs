// The evidence panel says what really happened (QA G32/G33/G34): the gate is not shown as the answer/hand-off decision, a not-found
// only says the AI was asked when it was, a direct answer names its score and entry, and the BLAKE3 digest is described as covering
// the normalised question + route, not the answer.   Run: node tests/evidence_truth.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const fn = name => { const i = html.indexOf(`function ${name}(`); let j = html.indexOf('\n}\n', i); return html.slice(i, j + 2); };
const _lEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const { evWhy, notFoundWhy } = new Function('_lEsc', fn('evWhy') + '\n' + fn('notFoundWhy') + '\nreturn {evWhy, notFoundWhy};')(_lEsc);

const esc = 'คิดซ้ำแล้วยังไม่พบในคู่มือ — จึงส่งให้ AI';
check('G32: ai=off not-found does not claim the AI was asked', notFoundWhy(esc, false, null) === 'คิดซ้ำแล้วยังไม่พบในคู่มือ · ไม่ได้เรียก AI', notFoundWhy(esc, false, null));
check('G32: an AI reading that ran says so', /ให้ AI ช่วยตีความคำถามแล้ว/.test(notFoundWhy(esc, true, null)) && !/จึงส่งให้ AI/.test(notFoundWhy(esc, true, null)));
check('G32: AI picks keep their note', /ยังไม่ตรงข้อเดียวชัด/.test(notFoundWhy(esc, true, [{}])));
check('G32: the strip no longer has an unreachable "ส่งต่อ AI" branch', !/d\.fast_path\?'0 token':'ส่งต่อ AI'/.test(html));
check('G32: the swimlane says the answer/hand-off call is the retrieval score', /การตัดสินว่าตอบเอง\/ส่งต่อใช้คะแนนค้นคู่มือ/.test(html) && !/ทุกคำตอบผนึก/.test(html));
const e = { id: 'thesis_submit_days', title: 'ส่ง <b>รูปเล่ม</b>' }, st = { id: 'staff_21', title: 'x', staff: true };
const w = evWhy([{ e, s: 5 }, { e: {}, s: 3 }], e);
check('G33: a direct answer names its score, runner-up and entry (escaped)', w === ' · คะแนน 5 (อันดับ 2 ได้ 3) · คู่มือ #thesis_submit_days ส่ง &lt;b&gt;รูปเล่ม&lt;/b&gt;', w);
check('G33: a staff answer is labelled as staff, in the card and the chip', /คำตอบเจ้าหน้าที่ #staff_21/.test(evWhy([{ e: st, s: 6 }], st)) && /\$\{hit\.staff\?'📝 ตอบจากคำตอบเจ้าหน้าที่':'✅ ตอบจากคู่มือทันที'\}/.test(html));
check('G34: the digest is described as question + route, not the answer, with the hashed text shown', /รหัส BLAKE3 ของคำถาม\+เส้นทาง: <code>\$\{d\.blake3_proof\}<\/code>/.test(html) && /คำถามหลังปรับรูป "\$\{_lEsc\(q\)\}"[^<]*ไม่ครอบคลุมตัวคำตอบ/.test(html) && !/BLAKE3 fingerprint: <code>/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
