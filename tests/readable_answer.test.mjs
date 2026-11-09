// KB answers are shown as short points, in the manual's own words (staff feedback 2026-11-03: "long paragraphs, hard to read").
// Runs the real answerPoints()/kbBody() from chatbot.html over the whole knowledge index. Run: node tests/readable_answer.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shippedWasm } from '../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = page.match(/^function answerPoints\(body\)\{[\s\S]*?\n(?=\/\/ --- Slot-filling)/m);   // the Rust call + the page's layout (kbBody)
const slot = page.match(/^function slotLead\(hit,q\)\{[^\n]*\n/m);
check('formatter and slot-filling source found', !!src && !!slot);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { answerPoints, kbBody } = new Function('WASM', 'linkify', 'LINKS', page.match(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/)[1] + slot[0] + src[0] + 'return { answerPoints, kbBody };')(shippedWasm(), t => esc(t), null);
const norm = t => String(t).replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '').replace(/[\s.。·]/g, '');   // " · " joins a label's short values (F17)
const lost = KB.filter(e => norm(e.answer) !== norm(answerPoints(e.answer).join(' ')));
check('every entry keeps all of its words (only spaces, full stops and list markers change)', lost.length === 0, lost.map(e => e.id).join(','));
check('no abbreviation is cut (พ.ศ. 2569 stays together)', answerPoints('ประกาศ พ.ศ. 2569 กำหนดให้ส่ง. หากเกินให้แจ้ง').join('|') === 'ประกาศ พ.ศ. 2569 กำหนดให้ส่ง|หากเกินให้แจ้ง');
check('a list in the manual stays a list', answerPoints('ช่องทาง:\n- โทร 02\n- อีเมล a@b\n- ไลน์ @x').length === 4);
check('a label keeps its value: one line, or up to two short bullets (F17)', answerPoints('ช่วงลงทะเบียน:\n• 13–20 กรกฎาคม 2569\nวันสุดท้าย:\n• 30 กรกฎาคม 2569\n• ภายในเวลา 22.00 น.\nหมายเหตุ:\nดูประกาศ').join('|') === 'ช่วงลงทะเบียน: 13–20 กรกฎาคม 2569|วันสุดท้าย: 30 กรกฎาคม 2569 · ภายในเวลา 22.00 น|หมายเหตุ: ดูประกาศ');
// a label is left on its own only to head a longer list, so it is never the last point; and no bare split word is a point
const bare = KB.flatMap(e => { const p = answerPoints(e.answer); return p.filter((x, i) => (/[:：]$/.test(x) && i === p.length - 1) || /^(?:ส่วน|หน้า|FAQ)$/.test(x)).map(x => e.id + ': ' + x); });
check('no point is a dangling label or a bare word in the whole index (F17)', bare.length === 0, bare.slice(0, 4).join(' ; '));
const cutAfterLabel = KB.filter(e => /[:：]<\/?\w*>?$|[:：]$/.test(kbBody(e, 'x').split('<details')[0].replace(/<small[^>]*>[^<]*<\/small>/g, '').trim()) && /<details/.test(kbBody(e, 'x')));
check('the fold never falls between a label and its list (F17)', cutAfterLabel.length === 0, cutAfterLabel.map(e => e.id).join());
{ const reg = KB.find(e => e.id === 'gm_registration_2569'), h = kbBody(reg, 'ลงทะเบียนภาคต้น 2569 วันไหน');
  check('a "▪" section header is a sub-heading, never the answer line nor a "• ▪" bullet (F17)', /^<small><b>1\. การลงทะเบียนปกติ ภาคต้น/.test(h) && !/• ▪/.test(h) && /\n<b>2\. การลงทะเบียนล่าช้า/.test(h), h.slice(0, 160));
  check('…and the first date is visible before the fold', /13–20 กรกฎาคม 2569/.test(h.split('<details')[0]) && /30 กรกฎาคม 2569/.test(h.split('<details')[0]), h.split('<details')[0]);
  const d = kbBody(KB.find(e => e.id === 'gm_registration_2569_second_semester'), 'วันสุดท้ายชำระค่าธรรมเนียม ภาคปลาย 2569'), line1 = d.split('\n').slice(0, 2).join('\n');
  check('…and its section header is shown once', (d.match(/ลงทะเบียนปกติ ภาคปลาย ปีการศึกษา 2569 \(หน้า 1/g) || []).length === 1, d.slice(0, 300));
  check('a deadline question leads with that term\'s วันสุดท้าย date, not the fine (F17)', /ภาคปลาย/.test(line1) && /วันสุดท้าย[^\n]*ธันวาคม 2569/.test(line1) && !/^<b>[\d,]+ บาท/.test(d), line1); }
{ const ab = KB.find(e => e.id === 'abstract_check_days');
  check('a duration lead keeps its space ("ภายใน 3 วันทำการ") and "นานเท่าไร" asks a duration (F17)', /^<b>ภายใน \d/.test(kbBody(ab, 'ตรวจบทคัดย่อใช้เวลานานเท่าไร')), kbBody(ab, 'ตรวจบทคัดย่อใช้เวลานานเท่าไร').slice(0, 60)); }
{ const grid = KB.find(e => /GRID/.test(e.answer) && (e.answer.match(/\d[\d,]*\s*บาท/g) || []).length > 1);
  check('an entry with several amounts gets no single bold amount (F17: GRID tiers)', !!grid && !/^<b>[\d,]+ ?บาท/.test(kbBody(grid, 'รายวิชา GRID ราคาเท่าไร')), grid && grid.id); }
const leave = KB.find(e => e.id === 'leave_of_absence'), html = kbBody(leave, 'ลาพักทำยังไง');
check('leave of absence: answer first, then bullet points, no glued opener', html.startsWith('ยื่นแบบฟอร์ม RA-04') && (html.match(/\n• /g) || []).length === 2 && !/ขั้นตอนเป็นแบบนี้/.test(html), html.slice(0, 80));
check('a number asked for is shown first in bold', /^<b>ภายใน 21 วัน<\/b>\n/.test(kbBody(KB.find(e => e.id === 'thesis_submit_days'), 'ส่งเล่มภายในกี่วัน')));
const longest = KB.reduce((a, e) => answerPoints(e.answer).length > answerPoints(a.answer).length ? e : a);
const lh = kbBody(longest, 'x');
check('long answers fold after 4 points behind "อ่านเพิ่ม"', (lh.split('<details')[0].match(/\n• /g) || []).length === 3 && /<summary>อ่านเพิ่มอีก \d+ ข้อ<\/summary>/.test(lh));
check('text is escaped (manual text cannot inject HTML)', !kbBody({ answer: 'a <img src=x onerror=alert(1)>. หากb' }, '').includes('<img'));
check('the old glued openers are gone from the page', !/ขั้นตอนเป็นแบบนี้ |เรื่องระยะเวลา |— รายละเอียด:/.test(page));
const one = KB.filter(e => answerPoints(e.answer).length === 1).length;
check(`one-paragraph answers: ${one} of ${KB.length} (was 93 before the formatter)`, one < 93);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
