#!/usr/bin/env node
// Route contract (plan 009 step 0): which branch of the chat's decision order (_askCore, chatbot.html) answers each question. The page stamps every
// bot bubble with data-route (ROUTE_NAME); this records it per question in a real headless Chrome (AI off, kernel unreachable: nothing is sent anywhere)
// and later checks it. The Rust port of the decision order (`decide_route`) must reproduce this file exactly.
//   node benchmark/golden/route_golden.mjs --write [--out benchmark/golden/route.json]     record (≈15 min for ~1,450 questions + 14 sessions)
//   node benchmark/golden/route_golden.mjs --update                                          record only the entries the golden does not have yet, drop the ones no longer in the pool
//   node benchmark/golden/route_golden.mjs --check [--limit N]                               compare (--limit: every k-th question, for CI)
// Pool: the test sets (official FAQ th + en, odd, English held-out, beginner, eval52) + the generated questions (benchmark/synth) + hand-written
// follow-up SESSIONS (state carries over inside a session). Each single question is preceded by "เริ่มใหม่" (the page's own reset of the programme in
// focus and the picked topic), so one question never inherits the previous one. The golden is tied to the manual: rebuild it when knowledge-index.json,
// programmes.json or the decision order changes ON PURPOSE; an unexpected difference is a regression (or a branch nobody labelled: route "unrouted").
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8'), UI = join(root, 'submissions/ui');
const argv = process.argv.slice(2), has = k => argv.includes(k), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const OUT = opt('--out') || join(root, 'benchmark/golden/route.json'), LIMIT = Number(opt('--limit') || 0);
const TRY = has('--try') ? (() => { const out = []; for (let i = argv.indexOf('--try') + 1; i < argv.length && !argv[i].startsWith('--'); i++) out.push(argv[i]); return out; })() : null, TRYMODE = opt('--mode') || 'ai_off';
if (!has('--write') && !has('--check') && !has('--update') && !TRY) { console.error('usage: route_golden.mjs --write | --check [--limit N]'); process.exit(2); }

const faq = JSON.parse(R('benchmark/field/faq_questions.json')).items;
const singles = [];
const add = (set, qs) => qs.forEach(q => q && q.trim() && singles.push({ set, q: q.trim() }));
add('faq_th', faq.map(x => x.th)); add('faq_en', faq.map(x => x.en));
add('odd', JSON.parse(R('benchmark/odd/odd_questions.json')).items.map(x => x.q));
add('en_heldout', JSON.parse(R('benchmark/field/english_heldout.json')).items.map(x => x[0]));
add('beginner', R('benchmark/coverage/beginner_questions.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
add('eval52', [...R('tests/kb_search.test.mjs').matchAll(/^\s*\['([^']+)',\s*(?:null|'[^']*'),\s*'[^']*'\],?$/gm)].map(m => m[1]));
if (existsSync(join(root, 'benchmark/synth/questions_001.json'))) add('synth', JSON.parse(R('benchmark/synth/questions_001.json')).items.map(x => x.q));
// sessions: the state that carries over (the programme in focus, a picked topic, the level) is what the single questions cannot reach
const sessions = [
  ['อยากสมัครจิตวิทยาคลินิก', 'แล้วทุนล่ะ'],
  ['พยาบาลศาสตร์', 'เอกสารที่ใช้', 'เกณฑ์ภาษาอังกฤษ'],
  ['ชีวสารสนเทศทางการแพทย์', 'แล้วค่าเทอมล่ะ', 'สอบวันไหน', 'เปิดรับไหม'],
  ['2018DG00', 'ค่าเทอม', 'ทุนมีไหม'],
  ['MPH', 'แล้วค่าเทอมสาธารณสุขล่ะ'],
  ['จิตวิทยาคลินิก', 'แล้วที่มหิดลล่ะ'],
  ['พยาบาลศาสตร์', 'ค่าเทอมเท่าไร'],
  ['เรียนไรดี', 'แล้วค่าเทอมล่ะ'],
  ['อยากสมัครเรียนจิตวิทยาคลินิก', 'เริ่มใหม่', 'แล้วค่าเทอมล่ะ'],
  ['จิตวิทยาคลินิก', 'ค่าเทอมฟรีไหม', 'แล้วค่าเทอมล่ะ'],
  ['อยากสมัครเรียนจิตวิทยาคลินิก', 'แล้วค่าเทอมล่ะ', 'แล้วสอบสัมภาษณ์วันไหน'],
  ['ชีวสารสนเทศทางการแพทย์', 'แล้วค่าเทอมล่ะ', 'เริ่มใหม่', 'แล้วค่าเทอมล่ะ'],
  ['เรียนไรดี', 'ปริญญาโท', 'อยากทำเกี่ยวกับคอม'],
  ['ค่าเทอมเท่าไร', 'ค่าเทอมพยาบาล', 'แล้วทุนล่ะ'],
  ['ลงทะเบียนเมื่อไหร่', 'ภาคปลาย 2569'],
  ['ติดปัญหา', 'เข้าระบบไม่ได้', 'ช่วยด้วย'],
  ['สวัสดี', 'ขอบคุณ', 'ส่งรูปเล่มภายในกี่วัน', 'แล้วถ้าส่งช้าล่ะ'],
  ['ตรวจบทคัดย่อกี่วัน', 'ค่าตรวจบทคัดย่อเท่าไหร่', 'ตรวจสอบสถานะการส่งตรวจบทคัดย่อได้อย่างไร'],
  ['อยากเรียนต่อ ป เอก วิศวะคอม', 'แล้วทุนล่ะ'],
  ['what is the tuition fee for nursing', 'how do I apply', 'when is the deadline'],
  ['เครียดมาก ไม่ไหวแล้ว', 'ขอดูข้อมูลของฉัน', 'ลาพักต้องทำอย่างไร'],
  ['ปีนี้เปิดรับสมัครรอบไหนบ้าง', 'รอบ 3 ปิดรับเมื่อไหร่', 'รอบ 1 ล่ะ'],
  ['TOEFL ITP ค่าสมัครเท่าไร', 'ขอรับผลคะแนนอย่างไร', 'ส่งทางไปรษณีย์ได้ไหม'],
  ['พิมพ์อะไรก็ได้ที่ไม่เกี่ยวกับคู่มือ', 'ค่าเทอมฟรีใช่ไหม', 'ป.โท ฟรีไหม'],
];
// branches the sets above never reach: probes written for them (a branch with no sample is a hole in the contract). Mode: ai_off (default) |
// ai_on (the AI branches are on; the proxy is a dead port, so they fall back to the manual text) | nocat (programmes.json answers 500)
// the programme path: every 12th question of the resolver's own golden (benchmark/golden/resolve.json: names, typos, codes, levels, topics) + finder / level-only / English asks
const RESOLVE_PROBES = (() => { try { return JSON.parse(R('benchmark/golden/resolve.json')).cases.map(c => c.q).filter((_, i) => i % 12 === 0); } catch { return []; } })();
const SCOPE_PROBES = ['รอบ 2 ปีการศึกษา 2570 ปิดรับเมื่อไหร่', 'สมัครรอบ 5', 'รอบที่ 3 เปิดรับเมื่อไหร่', 'round 3 deadline', 'รอบ 4 ภาคต้น 2570', 'รอบแรกกับรอบสองต่างกันไหม', 'ลงทะเบียนปี 2575', 'กำหนดการลงทะเบียนปี 2580', 'ลงทะเบียนภาคต้น 2569', 'ลงทะเบียนภาคปลาย 2570', 'ลงทะเบียนปี 2571', 'รับสมัครรอบ 2', 'รอบ 3 ปีการศึกษา 2570', 'ภาคต้น 2569 และ 2570 ต่างกันยังไง', 'ลงทะเบียน summer 2027', 'กำหนดการลงทะเบียน', 'ลงทะเบียนล่าช้า ภาคปลาย', 'เปิดรับสมัครปี 2570 รอบ 1', 'ลงทะเบียนเทอม 1/2569', 'ลงทะเบียนเทอม 2 ปี 70', 'เทอม 3/2569 add drop', 'ค่าปรับลงทะเบียนล่าช้า 2569', 'วันสุดท้ายชำระค่าเทอมภาคปลาย', 'รอบ 1 ปี 2572 กำหนดการ', 'ลงทะเบียนเรียนเมื่อไหร่', 'ลงทะเบียนภาคฤดูร้อน 2569', 'ถอนรายวิชาภาคต้น', 'กำหนดการรับสมัครรอบแรก', 'รับสมัครรอบ 1 ปีการศึกษา 2570 ปิดเมื่อไหร่', 'registration period for semester 1 2026', 'add drop เมื่อไหร่', 'สมัครเรียนรอบ 4', 'ปีการศึกษา 2569 ภาคปลาย ลงทะเบียนวันไหน', 'ลงทะเบียน 2570', 'ลงทะเบียน 2000 บาท', 'ข้อบังคับ 2565 ลงทะเบียน', 'ลงทะเบียน ๒๕๖๙ ภาคต้น', 'ลงทะเบียนภาค 2 ปี 69', 'กำหนดการสมัคร'];
const TIME_PROBES = ['ยังทันไหม', 'ตอนนี้ภาคเรียนอะไร', 'วันนี้ปิดรับหรือยัง', 'ตอนนี้ลงทะเบียนทันไหม', 'เทอมนี้ลงทะเบียนเมื่อไหร่', 'ตอนนี้เปิดรับสมัครรอบไหน', 'วันนี้เป็นช่วงลงทะเบียนหรือยัง', 'ปีนี้รอบ 1 ปิดรับหรือยัง', 'ภาคนี้ลงทะเบียนล่าช้าทันไหม', 'ตอนนี้ลาพักได้ไหม', 'ตอนนี้สอบอะไร', 'ยังทัน', 'วันนี้', 'ผ่านไปแล้วหรือยัง', 'ตอนนี้ค่าเทอมเท่าไร', 'ตอนนี้ภาคการศึกษาไหน ลงทะเบียนช่วงไหน', 'ขณะนี้ตัดรอบแล้วหรือยัง', 'ยังทันสมัครไหม',
  'ตอนนี้ปิดรับสมัครแล้วหรือยัง', 'ปีนี้เปิดรับสมัครเมื่อไหร่', 'ทันไหมครับ', 'ทันมั้ย'];
const FEE_CAREER_PROBES = ['เรียนฟรีไหม', 'ปริญญาโทฟรีหรือเปล่า', 'ป.เอก เรียนฟรี', 'เรียนต่อโทฟรีมีไหม', 'free master degree', 'ทำงานอะไรดี', 'อยากทำเกี่ยวกับคอม', 'อาชีพที่เกี่ยวกับสาธารณสุข', 'งานอะไรดีหลังจบ', 'สายงานไหนเงินเดือนสูง', 'อยากพัฒนา skill อะไร',
  'ค่าเทอมฟรีใช่ไหม', 'ค่าเล่าเรียนฟรีหรือเปล่า', 'tuition free?', 'ค่าเทอมวิศวกรรม', 'ค่าเทอมสาธารณสุข', 'tuition for nursing', 'ค่าเล่าเรียนเภสัช', 'ค่าธรรมเนียมการศึกษาแพทย์', 'ค่าเทอมการจัดการ', 'ค่าเทอมคอมพิวเตอร์', 'ค่าเทอมวิทยาศาสตร์'];
const PROGRAMME_PROBES = ['เรียนอะไรดี', 'ไม่รู้จะเรียนอะไร', 'หลักสูตรไหนดี', 'อยากเรียนต่อ ไม่รู้เรียนอะไรดี', 'ปริญญาโท', 'ปริญญาเอก นานาชาติ', 'ประกาศนียบัตร', 'ป.โท ที่เปิดรับ', 'หลักสูตรปริญญาเอกทั้งหมด', 'master', 'phd programs', 'international programmes',
  'when is the interview for clinical psychology', 'is nursing open for application', 'master of nursing science exam schedule', 'PhD in biochemistry deadline', 'what is the schedule for MSc computer science', 'apply for public health',
  '2018DG00', '2018DG00 ค่าเทอม', 'ชีวสารสนเทศทางการแพทย์', 'สาธารณสุขศาสตร์', 'พยาบาลศาสตร์', 'วิศวกรรมชีวการแพทย์ ปริญญาเอก', 'MPH', 'ITM', 'จิตวิทยาคลินิก', 'อยากสมัครเรียนจิตวิทยา', 'ค่าเทอมจิตวิทยาคลินิก', 'ทุนพยาบาลศาสตร์', 'สอบสัมภาษณ์สาธารณสุข', 'เปิดรับสมัครวิศวกรรม', 'หลักสูตรเภสัช', 'วิทยาศาสตร์'];
const PREFIX_PROBES = [   // the first branches of the order (wellbeing, smalltalk, personal, restart / overview) and the text preparation in front of them; the rows with no route of their own are the NEAR-MISSES that must not take one
  'อยากตาย', 'ไม่อยากมีชีวิตอยู่แล้ว', 'คิดฆ่าตัวตาย', 'ทำร้ายตัวเอง', 'โดนข่มขืน', 'ถูกคุกคามทางเพศ', 'I want to kill myself', 'self harm', 'suicidal thoughts',
  'เครียดมาก', 'ซึมเศร้า', 'ท้อมาก', 'ท้อ', 'ท้องถิ่น', 'ท้องฟ้า', 'ท้องเสีย', 'หมดไฟ', 'เหนื่อยมากเรียนไม่ไหว', 'นอนไม่หลับ', 'วิตกกังวลเรื่องสอบ', 'burn out', 'I feel depressed', 'overwhelmed with thesis', 'อยากเลิกเรียน', 'ไม่ไหวแล้ว',
  'สวัสดี', 'สวัสดีครับ', 'หวัดดีค่ะ', 'hello', 'hi', 'ขอบคุณครับ', 'ขอบใจนะ', 'thanks', 'บาย', 'ลาก่อน', 'bye', 'ทำอะไรได้บ้าง', 'คุณทำอะไรได้', 'สบายดีไหม', 'เป็นยังไงบ้าง', 'อยากรู้ว่าค่าเทอมที่นี่เป็นยังไงบ้าง',
  'สวัสดีค่ะ ลืมรหัสผ่านทำไง', 'ขอบคุณครับ แล้วลาพักได้กี่ภาค', 'hello what is the tuition fee', 'สวัสดีครับ ส่งรูปเล่มภายในกี่วัน', 'hi there', 'ขอบคุณมากครับ',
  'ผลสอบของฉันออกหรือยัง', 'ค่าเทอมที่ผมค้างจ่ายเท่าไร', 'ขอดูข้อมูลของเพื่อนผม รหัส 6537001', 'เกรดของลูกชายของฉัน', 'ที่ปรึกษาของผมคือใคร', 'สถานะคำร้องของฉันถึงไหน', 'ดูเกรดได้ที่ไหน', 'ผมสอบผ่านแล้วต้องทำอะไรต่อ',
  'คะแนนของน้องผม', 'ข้อมูลของเขา', 'เขาใจดีมาก', 'รหัส 6537001 ผลสอบ', 'ใบเสร็จของฉัน', 'GPA ของผมเท่าไร', 'ยอดค้างของฉันเท่าไหร่', 'ผลสอบเพื่อนผมเป็นยังไง', 'ผมมีหน่วยกิตครบหรือยัง', 'ฉันได้ทุนไหม',
  'ยกเลิก', 'เริ่มใหม่', 'เริ่มใหม่ครับ', 'ข้าม', 'ไม่รู้', 'ช่างมัน', 'ช่างมันเถอะ', 'ยกเลิกการลงทะเบียนทำอย่างไร', 'ถามเรื่องอื่น', 'ไม่เอาค่ะ',
  'มีอะไรน่าสนใจบ้าง', 'ต้องรู้อะไรบ้าง', 'ควรรู้อะไรบ้างไหม', 'เริ่มต้นยังไง', 'what should i know', 'anything interesting', 'น่าสนใจ', 'อะไรควรรู้',
  'ติดปัญหา', 'มีปัญหา', 'ช่วยด้วย', 'ปัญหา', 'งง', 'งงมาก', 'ทำยังไงดี', 'ไม่รู้จะทำยังไงดี', 'ช่วยหน่อย', 'ขอความช่วยเหลือ', 'ผมติดปัญหาครับ', 'ช่วยด้วยค่ะ',
  'ติดปัญหาวิทยานิพนธ์', 'ติดปัญหาจ่ายค่าเทอม', 'ติดปัญหาลาพัก', 'ติดปัญหาขอจบ', 'ติดปัญหาเข้าระบบ', 'ระบบลงทะเบียนมีปัญหา', 'เข้าระบบไม่ได้ ช่วยด้วย', 'ติดปัญหาส่งเล่มเกินกำหนดต้องเสียค่าปรับไหม',
  'ติดขัดเรื่องการลงทะเบียน', 'มีปัญหาเรื่องสารนิพนธ์', 'เจอปัญหาเรื่องธีสิส', 'ติดปัญหา turnitin', 'ติดปัญหาเรื่องเอกสาร', 'ติดปัญหาใบรับรอง', 'ติดปัญหาลงทะเบียนไม่ได้', 'ติดปัญหากับการลาออก', 'ติดปัญหา ขอ transcript', 'ปัญหาเรื่องทุน', 'มีปัญหาเรื่องที่พัก', 'ติดปัญหาเรื่องเกรด',
  'ค่าเทอม', 'ค่าเทอมปริญญาโท', 'ค่าเทอมเท่าไหร่ครับ', 'ค่าเรียนเท่าไร', 'tuition fee', 'how much is the fee', 'ค่าเทอมฟรีไหม', 'ค่าเทอมพยาบาล', 'ค่าธรรมเนียมเท่าไร', 'ค่าใช้จ่ายเท่าไร', 'ค่าเทอมป.เอก', "master's tuition fee", 'ค่าเทอมโดยทั่วไป', 'ขอทราบค่าเทอมหน่อย', 'ค่าเทอมมีไหม', 'ค่าเทอมปริญญาเอกที่นี่', 'what is the tuition', 'ค่าเทอมหลักสูตรนานาชาติ', 'ค่าเทอมทั่วไปปกติ', 'ค่าเหมาจ่ายเท่าไร', 'ค่าสมัครเท่าไร', 'ค่าเทอม 2569', 'ค่าเล่าเรียนปริญญาโทเท่าไหร่ค่ะ',
  'ค่าเทอมเท่าไร???', 'ค่าเทอมเท่าไร ครับ 🙏', 'ค่าเทอมเท่าไรรรรร', 'ค่าเทอม　เท่าไร', 'ค่าเทอมเท่าไร！', 'เครียดมากกกกก', 'สวัสดีีีี', 'ｏｋ', 'ｈｅｌｌｏ', 'เครียด​มาก', 'เครียด⁠มาก', 'เครียดํามาก',
  'ตรวจ้ิ', 'ลงทะเบียนเมื่อไหร่ ๒๕๖๙', 'ลงทะเบียน ผลสอบของเพื่อน ๖๕๓๗๐๐๑', '   ขอบคุณครับ   ', '😀', 'สวัสดี 😀😀', '？', 'ตรวจบทคัดย่อ…', '~~~',
];
// topic_picks: built from real KB title fragments (a fragment + 'ยังไง' whose core hits 1-12 titles); the page's topicPicks() decides, not this list
const TOPIC_PROBES = ['ตรวจบทคัดย่อ ยังไง', 'Abstract ยังไง', 'ใช้เวลากี่วัน ยังไง', 'ลืมรหัสผ่าน ยังไง', 'บัญชีถูกล็อก ยังไง', 'Student Card ยังไง', 'Best Scores คืออะไร ยังไง', 'ขอเปลี่ยนชื่อ-สกุล ยังไง', 'ขณะกำลังศึกษา ยังไง', 'ยื่นผลคะแนน TOEFL iBT ยังไง', 'ค่าสมัครเข้าศึกษาเท่าไร ยังไง', 'สนใจเข้าศึกษาต้องสมัครอย่างไร ยังไง', 'ติดต่อบัณฑิตวิทยาลัยได้ช่องทางใด ยังไง', 'กำหนดการเปิด-ปิดรับสมัครเมื่อไร ยังไง', 'มีสาขาวิชาอะไรเปิดรับสมัครบ้าง ยังไง', 'เข้าระบบ', 'สกุล', 'ลงไป', 'ภาคปลาย', 'ภาคต้น', 'ฤดูร้อน', 'คณะ', 'หลักสูตร', 'ลาพัก', 'ลาออก', 'ผ่อนผัน', 'โอน', 'เทียบโอน', 'รอบ', 'ประกาศ', 'ได้กี่คำ', 'เกิน', 'ไฟล์', 'รายวิชา', 'เท่าไร', 'ใช้ระบบ', 'yes', 'no', 'okay', 'https://mahidol.ac.th', '你好吗', 'Здравствуйте, сколько стоит', 'Γειά σου', '안녕 학비', 'อืม', 'เอ่อ','ฮ่าๆ', 'เห็นด้วย', 'ไม่รู้', 'hmm', 'नमस्ते','Привет, как дела', 'สวัสดีค่ะ', 'こんにちは、学費はいくらですか', 'Merhaba', 'Hola, ¿cuánto cuesta?', 'ありがとうございます', 'спасибо', 'ตรวจบ', 'สถา', 'ทหารป', 'ยแพร', 'รสอบ', 'มงแ', 'บเคีย', 'งื่อน', 'อกำห', 'ิงในเ', 'ามต', 'งไรแ', 'ยายเ', 'ละร', 'งหลั', 'งดูข', 'ว้เป็', 'กค่า', 'ยบโอ', 'และคุ', 'งผู้', 'ลคะ', 'ยังไงแ', 'าจขอค', 'ของก', 'ลัยจั', 'ทนอย่', 'ิบั', 'เป็นอ', 'จัดร', 'ำเข้า', 'ใบรับ', 'ศึกษา', 'สมัครเรียน', 'ตารางเรียน', 'ผลการเรียน', 'ปริญญา', 'สอบถาม'];
// ai_mock: the AI branches are on AND a mock /rewrite answers (the real model is not called: a contract is recorded, not Gemini's wording).
// Each question maps to the search phrases a correct rewrite would give; unknown questions get NONE (no phrases). Phrases are copied
// from the manual's own vocabulary (rewrite prompt examples), so the KB search decides the route, not the mock.
const REWRITE_MOCK = JSON.parse(R('benchmark/golden/rewrite_mock.json'));   // question -> phrases the mock /rewrite returns (fixture shared with golden_route.rs)
// 2026-11-08: more samples for the thin branches (scope_no_round had 1; advice_hybrid 4)
const SCOPE_NOROUND_MORE = ['รอบ 7 ปิดรับเมื่อไหร่', 'รอบที่ 8 เปิดรับเมื่อไหร่', 'รอบ 7 เปิดรับวันไหน', 'รอบที่ 9 ปิดรับเมื่อไหร่', 'รอบที่ 7 ของภาคต้น ปิดเมื่อไหร่', 'รอบที่ 8 ปิดรับเมื่อไหร่', 'รอบ 9 เปิดรับเมื่อไหร่', 'รอบที่ 9 เปิดรับวันไหน', 'รอบ 8 ปิดรับเมื่อไหร่', 'รอบ 7 ภาคต้นปิดเมื่อไหร่'];
// 2026-11-08: free_fee (3) and scope_no_year (4) were thin
const FREE_FEE_MORE = ['ค่าเทอมโทฟรีจริงไหม', 'ค่าเทอมเอกฟรีใช่หรือเปล่า', 'ค่าเทอมฟรีใช่มั้ย', 'ค่าเทอมโทฟรีหรือเปล่า', 'ค่าเทอมเอกฟรีจริงไหม', 'ค่าเทอมพยาบาลฟรีใช่ไหม', 'ค่าเทอมฟรีจริงใช่ไหม', 'ค่าเทอมฟรีหรือเปล่า', 'ค่าเทอมเอกฟรีมั้ย'];
const SCOPE_NOYEAR_MORE = ['รอบ 1 ภาคต้น 2575 เปิดรับเมื่อไหร่', 'ลงทะเบียนภาคปลาย 2581', 'ลงทะเบียนปี 2579', 'ลงทะเบียนภาคฤดูร้อน 2576', 'ลงทะเบียนภาคต้น 2582', 'ลงทะเบียนภาคปลาย 2579', 'ลงทะเบียนภาคฤดูร้อน 2580', 'ลงทะเบียนภาคต้น 2577', 'ลงทะเบียนภาคปลาย 2576'];
const ADVICE_HYBRID_MORE = ['ควรเตรียมตัวอย่างไรก่อนเข้าพบอาจารย์ที่ปรึกษา', 'แนะนำวิธีส่งรูปเล่มวิทยานิพนธ์ให้ทันกำหนด', 'ช่วยแนะนำการเตรียมตัวสอบ TOEFL ITP', 'แนะนำวิธีเตรียมเอกสารรูปเล่มวิทยานิพนธ์', 'ช่วยแนะนำวิธีส่งรูปเล่มวิทยานิพนธ์ให้ทันเวลา', 'ช่วยแนะนำการเตรียมตัวสอบ TOEFL ITP อย่างไรดี', 'แนะนำวิธีอ่านหนังสือสอบ TOEFL ITP', 'ช่วยแนะนำวิธีทำข้อสอบ TOEFL ITP', 'แนะนำวิธีเตรียมตัวสอบ TOEFL ITP อย่างไรดี'];
// 2026-11-08: advice_abstain = a weak KB match on an advice question (TOEFL advice has no entry of its own): the page abstains to staff
const ADVICE_ABSTAIN_MORE = ['ช่วยแนะนำการเตรียมตัวสอบ TOEFL iBT', 'แนะนำวิธีเตรียมตัวสอบ TOEFL ITP ให้ได้คะแนนดี', 'แนะนำวิธีเตรียมตัวสอบ TOEFL iBT ให้ได้คะแนนสูง', 'ช่วยแนะนำวิธีเตรียมตัวสอบ TOEFL ITP ในเวลาสั้น', 'แนะนำวิธีเตรียมตัวสอบ TOEFL ITP ด้วยตัวเอง', 'แนะนำวิธีเตรียมตัวสอบ TOEFL iBT ด้วยตัวเอง', 'ช่วยแนะนำวิธีเตรียมตัวสอบ TOEFL iBT ในเวลาสั้น', 'ช่วยแนะนำวิธีเตรียมตัวสอบ TOEFL iBT ให้ได้คะแนนดี', 'ช่วยแนะนำการเตรียมตัวสอบ TOEFL ITP ด้วยตัวเอง'];
const probes = [
  ['ai_off', [...SCOPE_NOROUND_MORE, ...FREE_FEE_MORE, ...SCOPE_NOYEAR_MORE, ...PREFIX_PROBES, ...TOPIC_PROBES, ...PROGRAMME_PROBES, ...FEE_CAREER_PROBES, ...TIME_PROBES, ...SCOPE_PROBES, ...RESOLVE_PROBES, 'ok', 'https://example.com', '1234', 'มีอะไรน่าสนใจบ้าง', 'ควรรู้อะไรบ้างก่อนเริ่ม', 'ขอดูผลการเรียนของฉัน', 'สถานะใบสมัครของฉันเป็นอย่างไร', '你好 请问学费多少', 'こんにちは', 'มีทุนไหม', 'มีหอพักไหม', 'ทุน', 'ขอบคุณครับ', 'โอเค', '555', 'ครับ', 'ok ได้เลย', 'Здравствуйте', 'مرحبا', '안녕하세요', 'Bonjour, quels sont les frais', 'Thesis submission deadline', 'What is the tuition fee for the PhD?', 'library opening hours', 'ค่าธรรมเนียม', 'หอพัก', 'วิทยานิพนธ์', 'ลงทะเบียน', 'ใบรับรอง', 'ตารางสอบ', 'ค่าสมัคร', 'สถานที่', 'เอกสาร', 'ปริญญานิพนธ์', 'กำหนดการ']],
  ['ai_on', [...ADVICE_HYBRID_MORE, ...ADVICE_ABSTAIN_MORE, 'ช่วยแนะนำวิธีวางแผนส่งรูปเล่มให้ทันกำหนด', 'แนะนำหน่อยว่าควรเลือกเรียนอะไรดี', 'ควรเตรียมตัวสอบ TOEFL ยังไงดี', 'ช่วยแนะนำการจัดการเวลาทำวิทยานิพนธ์', 'ลองแนะนำวิธีขอทุนหน่อย', 'ช่วยแนะนำวิธีเตรียมตัวสอบ MU GRAD หน่อย', 'วางแผนทำวิทยานิพนธ์ให้จบทันยังไงดี', 'แนวทางจัดการเวลาตอนเขียนเล่มวิทยานิพนธ์', 'ควรทำอย่างไรถ้า Turnitin เกิน 25%', 'ช่วยแนะนำการลาพักการศึกษา', 'เตรียมตัวสมัครเรียนต่อปริญญาเอกต้องทำอะไรบ้าง', 'ทำยังไงดีถ้าส่งเล่มไม่ทัน', 'ช่วยวางแผนการลงทะเบียนเรียนหน่อย', 'ควรทำอะไรก่อนสอบวิทยานิพนธ์', 'แนะนำที่พักใกล้ศาลายา', 'ช่วยแนะนำวิธีติดต่ออาจารย์ที่ปรึกษา', 'ส่งรูปเล่มภายในกี่วัน', 'ค่าสมัครสอบ TOEFL ITP เท่าไร']],   // understood_by_ai needs a WORKING /rewrite: not reachable without a mock proxy (known hole)
  ['ai_mock', Object.keys(REWRITE_MOCK)],
  ['nocat', ['อยากสมัครเรียนจิตวิทยา', 'ค่าเทอมหลักสูตรพยาบาล', 'หลักสูตรอะไรเปิดรับบ้าง', 'สมัครสอบ TOEFL', 'สมัครสอบ', 'สมัครเรียน', 'สมัครงาน', 'ป.โท', 'ปริญญาเอกสมัครยังไง', 'master program', 'apply for PhD', 'study abroad', 'ค่าเทอม', 'ทุน', 'หลักสูตรอะไรบ้าง', 'เรียนไรดี', 'ทำงานอะไรดี', 'เปิดรับสมัคร', 'พักการเรียน', 'ผลการเรียน', 'ตารางเรียน', 'ลาพัก', 'ส่งเล่มกี่วัน', 'คณะแพทย์', 'ต่อโท', 'ศึกษาต่อ', 'เข้าศึกษา', 'ทุนเรียนต่อ', 'ฝ่ายรับสมัครอยู่ไหน', 'ใบปริญญา', 'ลงทะเบียนเรียน', 'ติดปัญหา', 'สวัสดี', 'เครียดมาก', 'ขอสมัครสอบสมัครเรียน']],
];
// PIN (2026-11-08): a topic chip tapped under a question. One item per (typed question, chip index): the first 3 chips of each topic list
// only the questions whose golden route shows a chip list (topic_picks, disambiguate): other routes have no chips to tap
const CHOOSER_ROUTES = new Set(['topic_picks', 'disambiguate']);
const chooserQs = new Set(JSON.parse(readFileSync(OUT, 'utf8')).filter(x => x.kind === 'single' && CHOOSER_ROUTES.has(x.route)).map(x => x.q));
const PIN_ITEMS = TOPIC_PROBES.filter(q => chooserQs.has(q)).flatMap(q => [0, 1, 2].map(chip => ({ kind: 'pin', set: 'pin', typed: q, chip, qs: [q] })));
const items = [...singles.map((s, i) => ({ kind: 'single', set: s.set, qs: [s.q] })),
  ...probes.flatMap(([mode, qs]) => qs.map(q => ({ kind: 'single', set: 'probe', mode, qs: [q] }))), ...sessions.map((qs, i) => ({ kind: 'session', set: 'session', qs })), ...PIN_ITEMS];
// one key for items, recorded results and the golden: a session by its turns, a single by its question, a pin by (typed question, chip index)
const KEY = r => JSON.stringify(r.kind === 'session' ? [r.kind, r.qs] : [r.kind, r.mode || 'ai_off', r.typed ?? r.q ?? r.qs[0], r.chip ?? null]);
const keyOf = KEY;
const goldOld = has('--update') && existsSync(OUT) ? new Map(JSON.parse(readFileSync(OUT, 'utf8')).map(r => [KEY(r), r])) : new Map();
const pick = has('--update') ? items.filter(it => !goldOld.has(keyOf(it))) : TRY ? TRY.map(q => ({ kind: 'single', set: 'try', mode: TRYMODE, qs: [q] })) : LIMIT ? items.filter((_, i) => i % LIMIT === 0) : items;

const mockSrv = http.createServer((q, s) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (q.method === 'OPTIONS') { s.writeHead(204, cors); return s.end(); }
  if (new URL(q.url, 'http://x').pathname !== '/rewrite') { s.writeHead(404, cors); return s.end(); }
  let body = ''; q.on('data', d => { body += d; }); q.on('end', () => {
    const input = (() => { try { return JSON.parse(body).input || ''; } catch { return ''; } })();
    const queries = REWRITE_MOCK[input] || [];
    s.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); s.end(JSON.stringify({ queries, source: queries.length ? 'gemini' : 'none' }));
  });
});
await new Promise(r => mockSrv.listen(0, '127.0.0.1', r)); const MP = mockSrv.address().port;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/chatbot.html';
  if (p === '/programmes.json' && /nocat=1/.test(q.headers.referer || '')) { s.writeHead(500); return s.end(); }
  const f = normalize(join(UI, p)); if (!f.startsWith(UI) || !existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const SP = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), 'rw-route-'));
const chrome = spawn(process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = () => { try { chrome.kill(); } catch {} srv.close(); mockSrv.close(); };
process.on('exit', done);
const wsUrl = await new Promise(res => { let b = ''; chrome.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); });
const tab = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (c, ms = 8000) => { for (let t = 0; t < ms; t += 40) { if (await ev(c)) return true; await wait(40); } return false; };
await send('Page.enable'); await send('Runtime.enable');
// the page keeps the chat and the programme in focus per TAB (sessionStorage) and restores them on load: without this, a session would start with whatever the previous one left behind
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{sessionStorage.clear();localStorage.clear();}catch(e){}' });
// ai=off + a dead kernel/proxy: no gap-log entry, no vote, no AI call; ?now pins nothing - date-dependent routes (time_intent) are decided by words, not by the clock
const URLS = { ai_mock: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:${MP}`, ai_off: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:9&ai=off`, ai_on: `http://127.0.0.1:${SP}/chatbot.html?api=http://127.0.0.1:9&llm=http://127.0.0.1:9`, nocat: `http://127.0.0.1:${SP}/chatbot.html?nocat=1&api=http://127.0.0.1:9&llm=http://127.0.0.1:9&ai=off` };
// --route rust: the page takes its route from the Rust decision order (?route=rust), so the same questions must give the same routes
if (opt('--route')) for (const k of Object.keys(URLS)) URLS[k] += `&route=${opt('--route')}`;   // default page: Rust routes; --route js = the JS fallback
let MODE = 'ai_off';
const boot = async () => { shLast = null; await send('Page.navigate', { url: URLS[MODE] }); await until(`!!document.getElementById('q') && !document.getElementById('q').disabled`, 30000); await until(`document.documentElement.classList.contains('agency-pending')===false`, 5000); await wait(300); };
const bots = () => ev(`document.querySelectorAll('#chat .msg.b').length`);
// shadow mode (chatbot.html): the Rust decision order is compared with the page's route on every question; totals are summed across page loads
const SH = { n: 0, same: 0, pending: 0, errors: 0, diffs: [] }; let shLast = null;
const shadowSync = async () => { const s = await ev('(() => { const s = window.__shadow; return s ? { n: s.n, same: s.same, pending: s.pending, errors: s.errors, diffs: s.diffs } : null; })()'); if (!s) return;
  const p = shLast || { n: 0, same: 0, pending: 0, errors: 0, diffs: [] };
  SH.n += s.n - p.n; SH.same += s.same - p.same; SH.pending += s.pending - p.pending; SH.errors += s.errors - p.errors; SH.diffs.push(...s.diffs.slice(p.diffs.length)); shLast = s; };
const ask = async q => { const n = await bots();
  await ev(`(()=>{const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('send').click();})()`);
  await until(`document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${n}`); await wait(60);
  await shadowSync();
  return ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); return b ? (b.dataset.route ?? null) : null;})()`); };
// PIN: the topic list under the typed question; a tap on chip i sets the page's PIN to that entry and asks its title. The recorded route is the answer to
// the TITLE (what the page sends), with the entry id the Rust side receives as `pinned`. A typed question with fewer chips records nothing for the rest.
const pinAsk = async it => {
  await ask('เริ่มใหม่'); await ask(it.typed);
  const chip = await ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); const c=b&&b.querySelectorAll('.dislist .dis[data-id]')[${it.chip}]; return c ? {id:c.dataset.id, title:c.firstChild.textContent} : null;})()`);
  if (!chip) return null;
  const nb = await bots();
  await ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); b.querySelectorAll('.dislist .dis[data-id]')[${it.chip}].click();})()`);
  await until(`document.querySelectorAll('#chat .msg.b:not(.pending)').length > ${nb}`); await wait(60);
  await shadowSync();
  const route = await ev(`(()=>{const b=[...document.querySelectorAll('#chat .msg.b')].pop(); return b ? (b.dataset.route ?? null) : null;})()`);
  return { kind: 'pin', set: 'pin', typed: it.typed, chip: it.chip, q: chip.title, pin: chip.id, route };
};
const result = []; let n = 0, booted = '';
for (const it of pick) {
  const mode = it.mode || 'ai_off';
  if (mode !== booted || n++ % 60 === 0) { MODE = mode; await boot(); booted = mode; }
  if (it.kind === 'pin') { const r = await pinAsk(it); if (r) result.push({ ...r, ai_off: mode === 'ai_off' }); else console.log(`no chip ${it.chip} under ${JSON.stringify(it.typed)}`); continue; }
  if (it.kind === 'session') { await boot(); const routes = []; for (const q of it.qs) routes.push(await ask(q)); result.push({ kind: 'session', qs: it.qs, routes, ai_off: mode === 'ai_off' }); }
  else { await ask('เริ่มใหม่'); result.push({ kind: 'single', set: it.set, ...(it.mode && it.mode !== 'ai_off' ? { mode: it.mode } : {}), q: it.qs[0], route: await ask(it.qs[0]), ai_off: mode === 'ai_off' }); }
}
done();
console.log(`shadow (Rust decide_route vs the page): ${SH.n} questions, ${SH.same} same, ${SH.pending} pending (AI rewrite), ${SH.errors} errors, ${SH.diffs.length} differ`);
for (const d of SH.diffs.slice(0, 12)) console.log('  shadow diff:', JSON.stringify(d));
if (has('--update')) {
  const fresh = new Map(result.map(r => [KEY(r), r]));
  const merged = items.map(it => { const k = keyOf(it); return fresh.get(k) || goldOld.get(k); }).filter(Boolean);
  writeFileSync(OUT, '[\n' + merged.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
  console.log(`updated: ${result.length} recorded, ${merged.length - result.length} kept, ${[...goldOld.keys()].filter(k => !items.some(it => keyOf(it) === k)).length} dropped -> ${OUT}`); process.exit(0);
}
if (TRY) { for (const r of result) console.log(`${(r.route ?? 'null').padEnd(24)} ${r.q}`); process.exit(0); }
const key = KEY;
const val = r => JSON.stringify(r.kind === 'session' ? r.routes : r.route);
if (has('--write')) {
  const lines = result.map(r => JSON.stringify(r));
  writeFileSync(OUT, '[\n' + lines.join(',\n') + '\n]\n');
  const counts = {}; for (const r of result) for (const x of (r.kind === 'session' ? r.routes : [r.route])) counts[x] = (counts[x] || 0) + 1;
  console.log(`wrote ${result.length} entries -> ${OUT}`); console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(5)} ${k}`).join('\n'));
  process.exit(counts.unrouted || counts.null ? 1 : 0);
}
const gold = new Map(JSON.parse(readFileSync(OUT, 'utf8')).map(r => [key(r), r]));
let diff = 0, missing = 0;
for (const r of result) { const g = gold.get(key(r)); if (!g) { missing++; console.log('not in golden:', key(r).slice(0, 80)); continue; }
  if (val(g) !== val(r)) { diff++; console.log(`DIFF ${key(r).slice(0, 90)}\n   golden ${val(g)}\n   now    ${val(r)}`); } }
console.log(`${result.length} checked${LIMIT ? ` (every ${LIMIT}th)` : ''}: ${diff} differences, ${missing} not in golden`);
process.exit(diff || missing ? 1 : 0);
