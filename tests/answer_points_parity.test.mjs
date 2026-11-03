// Web and LINE must cut KB answers into the same points (until both call one Rust implementation, .plans/002).
// Compares the inline answerPoints()/slotLead in submissions/ui/chatbot.html with integrations/_shared/answer_points.mjs
// over every entry of both knowledge copies, and checks the LINE text format. Run: node tests/answer_points_parity.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { answerPoints, slotLead, readableText } from '../integrations/_shared/answer_points.mjs';
import { KB as LINE_KB } from '../integrations/line-worker/kb-data.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const WEB_KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = page.match(/const _SPLIT_BEFORE[\s\S]*?\n}\n(?=const _SHOW_POINTS)/), slot = page.match(/const _SLOTS=[\s\S]*?\n  return ''; }\n/);
check('web formatter and slot source found', !!src && !!slot);
const web = new Function(slot[0] + src[0] + 'return { answerPoints, slotLead };')();
const all = [...WEB_KB, ...LINE_KB];
const diff = all.filter(e => JSON.stringify(web.answerPoints(e.answer)) !== JSON.stringify(answerPoints(e.answer)));
check(`web and LINE cut every answer the same way (${all.length} entries)`, diff.length === 0, diff.slice(0, 3).map(e => e.id).join(','));
const qs = ['ส่งเล่มภายในกี่วัน', 'ค่าธรรมเนียมเท่าไหร่', 'turnitin เกินกี่ %', 'ทำยังไง'];
const sdiff = all.filter(e => qs.some(q => web.slotLead(e, q) !== slotLead(e, q)));
check('web and LINE lead with the same asked-for number', sdiff.length === 0, sdiff.slice(0, 3).map(e => e.id).join(','));
const leave = all.find(e => e.id === 'leave_of_absence'), t = readableText(leave, 'ลาพักทำยังไง');
check('LINE text: answer first, then bullet lines, no glued opener', t.startsWith('ยื่นแบบฟอร์ม RA-04') && (t.match(/\n• /g) || []).length >= 1 && !/ขั้นตอนเป็นแบบนี้/.test(t), t.slice(0, 80));
const days = all.find(e => e.id === 'thesis_submit_days');
check('LINE text leads with the asked number', readableText(days, 'ส่งเล่มภายในกี่วัน').startsWith('👉 ภายใน 21 วัน'));
const long = { answer: Array.from({ length: 10 }, (_, i) => `ข้อ${i}.`).join(' '), source_url: '' };
check('more than 6 points: says how many are left and, with no link, invites a follow-up', /มีรายละเอียดอีก 4 ข้อ พิมพ์ถามต่อได้เลยครับ/.test(readableText(long, '')), readableText(long, ''));
check('the old humanize module is gone from the LINE worker', !/humanize/.test(readFileSync(join(root, 'integrations/line-worker/worker.mjs'), 'utf8')));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
