// Dates against the clock (QA G16, G22): passed cut-offs and windows are tagged, an "open" announcement whose every cut-off
// has passed is not shown green and loses the apply button, a closed one that still lists future rounds says so, and an old
// snapshot gets a visible warning. Only tags dates the data already prints. Run: node tests/date_awareness.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shippedWasm } from '../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const F = new Function('WASM', 'ENG', blk('today') + blk('linkify') + blk('programme-resolve') + '\nreturn {dateSpan, dateState, todayIso, daysSince, programmeCard, staleLine, datedPicks, resolveProgramme};')(shippedWasm(), {});
const DOC = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')), P = DOC.programmes;
const at = (d, fn) => { globalThis.__today = d; try { return fn(); } finally { delete globalThis.__today; } };
const txt = h => h.replace(/<[^>]+>/g, '');

// --- parser
const sp = F.dateSpan;
check('single abbreviated date', JSON.stringify(sp('จ. 30 พ.ย. 2569')) === '{"start":"2026-11-30","end":"2026-11-30"}', JSON.stringify(sp('จ. 30 พ.ย. 2569')));
check('same-month range with en dash', JSON.stringify(sp('ช่วงลงทะเบียนปกติ: 14–21 ธันวาคม 2569')) === '{"start":"2026-12-14","end":"2026-12-21"}');
check('cross-month range borrows the next year', JSON.stringify(sp('16 มกราคม–26 เมษายน 2570')) === '{"start":"2027-01-16","end":"2027-04-26"}');
check('schedule-cell range "พฤ. 9 ก.ค. - พฤ. 16 ก.ค. 2570"', JSON.stringify(sp('พฤ. 9 ก.ค. - พฤ. 16 ก.ค. 2570')) === '{"start":"2027-07-09","end":"2027-07-16"}');
check('no year written -> null (nothing guessed)', sp('ภายใน 30 พ.ย.') === null && sp('ภายใน 21 วัน') === null);
check('a year is not read as a day ("2569 มกราคม")', sp('ปี 2569 มกราคม') === null);
check('states: passed / now / today / ahead', F.dateState('14–21 ธันวาคม 2569', '2026-12-22') === 'passed' && F.dateState('14–21 ธันวาคม 2569', '2026-12-14') === 'now'
  && F.dateState('30 พ.ย. 2569', '2026-11-30') === 'today' && F.dateState('30 พ.ย. 2569', '2026-11-04') === '');
check('todayIso is a Bangkok calendar day by default', /^\d{4}-\d{2}-\d{2}$/.test(F.todayIso()));
check('globalThis.__today overrides the clock', at('2030-01-02', () => F.todayIso()) === '2030-01-02');

// --- programme card
const open = P.find(p => p.announcement && p.announcement.status === 'กำลังเปิดรับสมัคร' && p.announcement.apply_url
  && (p.announcement.sections['กำหนดการสอบคัดเลือก'] || []).some(l => /^ตัดรอบ/.test(l)));
const card = (p, d, topic, q) => at(d, () => F.programmeCard(p, DOC.fetched_at, DOC.year, topic, q));
{ const c = card(open, DOC.fetched_at);
  check('on the snapshot day an open programme is green with the apply button', /🟢 สถานะ/.test(c.html) && /ระบบสมัครออนไลน์/.test(c.links));
  check('…and the quiet as-of line, no stale warning', /ข้อมูลจากเว็บบัณฑิตวิทยาลัย ณ/.test(c.html) && !/⚠️ ข้อมูลนี้เก็บ/.test(c.html)); }
{ const c = card(open, '2027-11-04');
  check('a year later: not green, says every listed cut-off has passed', !/🟢/.test(c.html) && /⚪ สถานะ.*ทุกรอบที่ระบุตัดรอบไปแล้ว/.test(txt(c.html)), txt(c.html).slice(0, 300));
  check('…the apply button is gone', !/ระบบสมัครออนไลน์/.test(c.links));
  check('…passed dates are tagged in the schedule table', /<td>[^<]*<small class="when when-passed">\(ผ่านไปแล้ว\)<\/small><\/td>/.test(c.html));
  check('…and the as-of line becomes a stale warning with the age', new RegExp(`⚠️ ข้อมูลนี้เก็บจากเว็บบัณฑิตวิทยาลัยเมื่อ \\d+ \\S+ 25\\d\\d \\(${F.daysSince(DOC.fetched_at, '2027-11-04')} วันก่อน\\)`).test(txt(c.html)), txt(c.html).slice(-200)); }
{ const c = card(open, '2027-11-04', 'status', 'เปิดรับไหม');
  check('status answer a year later lists cut-offs tagged as passed', /ตัดรอบ[\s\S]*\(ผ่านไปแล้ว\)/.test(c.html.split('\n').slice(0, 3).join('\n'))); }
// G22: closed + empty notice + future rounds -> say so
const closed = P.find(p => p.code === '2022M04G');
{ const c = card(closed, DOC.fetched_at);
  check('closed card with future rounds and no notice explains the mix (G22)', /🔴[\s\S]*ℹ️ ประกาศนี้แสดงทั้งสถานะ "ปิดรับสมัครแล้ว" และกำหนดการรอบที่ยังไม่ถึง/.test(c.html)); }
{ const c = card(closed, '2027-11-04');
  check('…but not once every round has passed', !/ℹ️ ประกาศนี้แสดงทั้งสถานะ/.test(c.html)); }
check('every programme renders on a far-future date without throwing',
  P.every(p => { try { return card(p, '2030-01-01', 'schedule', 'ตัดรอบวันไหน').html.length > 40; } catch { return false; } }));
check('stale line is empty within 30 days', F.staleLine('2026-11-02', '2026-12-02') === '' && F.staleLine('2026-11-02', '2026-12-03') !== '');
// --- dated KB schedule entries (kbBody)
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
const kbSrc = html.match(/const _SPLIT_BEFORE[\s\S]*?\n}\n(?=\/\/ --- Slot-filling)/)[0], slotSrc = html.match(/const _SLOTS=[\s\S]*?\n  return ''; }\n/)[0];
const kbBody = new Function('linkify', 'LINKS', blk('today') + slotSrc + kbSrc + 'return kbBody;')(t => String(t), null);
const reg = KB.find(e => e.id === 'gm_registration_2569_second_semester'), r1 = KB.find(e => e.id === 'gm_schedule_2570_round1');
{ const h = at('2026-12-16', () => kbBody(reg, 'ลงทะเบียนภาคปลาย 2569'));
  check('registration window in progress is tagged "อยู่ในช่วงนี้"', /14–21 ธันวาคม 2569 <small class="when when-now">/.test(h), h.slice(0, 300)); }
{ const h = at('2026-12-05', () => kbBody(r1, 'ตัดรอบสมัครรอบ 1'));
  check('round-1 cut-off after 30 Nov 2569 is tagged passed', /30 พฤศจิกายน 2569[^\n]*\(ผ่านไปแล้ว\)/.test(h), h.slice(0, 300));
  check('…the snapshot line "ที่เก็บวันที่ 26 ตุลาคม 2569" is never tagged', !/เก็บวันที่ 26 ตุลาคม 2569[^\n]*\(ผ่านไปแล้ว\)/.test(h)); }
check('undated entries are untouched', !/class="when/.test(at('2030-01-01', () => kbBody(KB.find(e => e.id === 'thesis_submit_days'), 'x'))));
// --- "now / still in time" questions (G17)
// timeIntent is Rust's since plan 015 step 4c: its cases are in crates/reflex-wasm/tests/route_predicates.rs
{ const p = F.datedPicks(KB, 'registration', '2026-12-16');
  check('registration picks on 2026-12-16: in-progress terms first, then upcoming, all labelled', p.length === 4 && p[0].state === 'now' && p.some(x => x.e.id === 'gm_registration_2569_second_semester' && x.state === 'now') && p[p.length - 1].state === 'ahead', p.map(x => x.e.id + ':' + x.state).join(' ')); }
{ const p = F.datedPicks(KB, 'registration', '2027-11-04');
  check('a year later the 2570 terms lead and a passed 2569 term is labelled passed', p[0].e.id === 'gm_registration_2570_first' && p.some(x => x.state === 'passed'), p.map(x => x.e.id + ':' + x.state).join(' ')); }
check('admissions picks are the dated admissions schedule only', F.datedPicks(KB, 'admissions', '2026-11-04').every(x => x.e.category === 'admissions'));
check('"<programme>ยังทันไหม" is that programme\'s status, not a dentistry picker', (r => r && r.kind === 'one' && r.topic === 'status' && r.row.code === '2022M04G')(F.resolveProgramme('จิตวิทยาคลินิกยังทันไหม', P)));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
