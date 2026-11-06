// A question about ONE thing of a programme gets that thing as the first lines of the card, the rest folded
// (staff feedback 2026-11-03: people should not have to scan the card). Uses the real resolver and card.
// Run: node tests/answer_first.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const bm = html.match(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/), lk = html.match(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/), td = html.match(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/);
const { resolveProgramme, programmeCard } = new Function(td[1] + lk[1] + '\n' + bm[1] + '\nreturn {resolveProgramme, programmeCard};')();
const DOC = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')), P = DOC.programmes;
const ask = q => { const r = resolveProgramme(q, P); if (!r || r.kind !== 'one') return { r, h: '' }; return { r, h: programmeCard(r.row, DOC.fetched_at, DOC.year, r.topic, q).html }; };
const first = h => h.split('\n')[0].replace(/<[^>]+>/g, '');
{ const { r, h } = ask('จิตวิทยาคลินิกสอบสัมภาษณ์วันไหน');
  check('"…สอบสัมภาษณ์วันไหน" resolves to the programme with topic schedule', r && r.kind === 'one' && r.row.code === '2022M04G' && r.topic === 'schedule', r && `${r.kind} ${r.topic}`);
  check('…and the first line is the interview dates', /^🗓️ สอบสัมภาษณ์: รอบ \d .+ 25\d\d/.test(first(h)), first(h));
  check('…the full schedule is still there, folded', /<details class="more"><summary>ข้อมูลอื่นของหลักสูตรนี้<\/summary>[\s\S]*class="sched"/.test(h)); }
{ const { r, h } = ask('จิตวิทยาคลินิกปิดรับสมัครยัง');
  check('"…ปิดรับสมัครยัง" leads with the status', r && r.topic === 'status' && /^🔴 สถานะบนเว็บบัณฑิตวิทยาลัย: ปิดรับสมัครแล้ว/.test(first(h)), first(h)); }
{ const { r, h } = ask('ค่าเทอมจิตวิทยาคลินิก');
  check('a fee question leads with the fee block, not the programme title', r && r.topic === 'fee' && /^💰/.test(first(h)), first(h)); }
{ const { r, h } = ask('อยากสมัครเรียนจิตวิทยาคลินิก');
  check('a plain "I want to apply" keeps the full card, title first, nothing folded away', r && !r.topic && /^วิทยาศาสตรมหาบัณฑิต/.test(first(h)) && !/ข้อมูลอื่นของหลักสูตรนี้/.test(h) && /class="sched"/.test(h), first(h)); }
const open = P.find(p => p.announcement && p.announcement.status === 'กำลังเปิดรับสมัคร' && (p.announcement.sections['กำหนดการสอบคัดเลือก'] || []).some(l => /^ตัดรอบ/.test(l)));
{ const h = programmeCard(open, DOC.fetched_at, DOC.year, 'status', 'เปิดรับไหม').html;
  check('an OPEN programme\'s status answer also gives the cut-off dates', /^🟢/.test(first(h)) && /🗓️ <b>ตัดรอบ/.test(h.split('\n').slice(0, 3).join('\n')), h.slice(0, 200)); }
{ const { r, h } = ask('จิตวิทยาคลินิกประกาศผลวันไหน');
  check('"ประกาศผล" picks the admitted-list row', r && /^🗓️ ประกาศรายชื่อผู้มีสิทธิ์เข้าศึกษา:/.test(first(h)), first(h)); }
const topics = ['fee', 'scholarship', 'docs', 'elig', 'english', 'schedule', 'status'];
check('every programme x every topic renders without throwing', P.every(p => topics.every(t => { try { return programmeCard(p, DOC.fetched_at, DOC.year, t, 'สอบสัมภาษณ์วันไหน').html.length > 40; } catch { return false; } })));
check('no announcement + schedule/status question does not talk about scholarships', !/ทุน/.test(programmeCard({ ...P[0], announcement: null }, DOC.fetched_at, DOC.year, 'schedule', 'x').html));
check('field-level questions are not stolen ("สอบสัมภาษณ์พยาบาล" is not one card)', (r => !r || r.kind !== 'one')(resolveProgramme('สอบสัมภาษณ์พยาบาล', P)));
check('a broad status question still gets the programme picker, not the KB ("หลักสูตรพยาบาลเปิดรับไหม")', (r => r && r.kind === 'broad')(resolveProgramme('หลักสูตรพยาบาลเปิดรับไหม', P)));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
