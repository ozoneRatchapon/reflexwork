#!/usr/bin/env node
// Differential contract for the text part of the Rust decision order (crates/reflex-wasm/src/route, tests/route_text.rs): the page's own
// normChat / wellbeingKind / personalAsk / isRestartPhrase / isOverviewQuestion run over every recorded question plus edge strings, and the results are
// written to benchmark/golden/route_text.json. (Not golden_dump.mjs: that one rewrites every golden file.)   Run: node scripts/dump_route_text_golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/chatbot_fns.mjs';
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const slice = (from, to, incl = false) => { const a = html.indexOf(from), b = html.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`not found: ${from} .. ${to}`); return html.slice(a, b + (incl ? to.length : 0)); };
const norm = slice('function normChat(q){', '// </chat-normalize>');
const wb = slice('function wellbeingKind(text){', 'function classifySmalltalk');
const pers = slice('const _PERS_RECORD=', "  return null; }\n", true);
const overview = slice('function isOverviewQuestion(text){', '// Whole-utterance control phrases');
const restart = slice('function isRestartPhrase(text){', '\n', true);
const stuckSrc = slice('const _STUCK_W=', 'function stuckPicks(c){');
const intakeSrc = (html.match(/const _ISSUE_CATS=[\s\S]*?return null; \}\n/) || [])[0]; if (!intakeSrc) throw new Error('classifyIssue not found');
const progBlock = (html.match(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/) || [])[1]; if (!progBlock) throw new Error('programme-resolve block not found');
const englishSrc = (html.match(/function isEnglish\(q\)\{[^\n]*\}\n/) || [])[0]; if (!englishSrc) throw new Error('isEnglish not found');
const todayBlock = (html.match(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/) || [])[1]; if (!todayBlock) throw new Error('today block not found');
const F = new Function(`${todayBlock}\n${progBlock}\n${englishSrc}\n${intakeSrc}\n${stuckSrc}\n${norm}\n${wb}\n${pers}\n${overview}\n${restart}\nreturn { dateSpan, timeIntent, isFinderQuestion, isLevelOnlyQuestion, englishProgrammeAsk, followUpAspect, isGenericFeeQuestion, hasStudyIntent, stuckTopic, _STUCK_CATS, normChat, wellbeingKind, personalAsk, isRestartPhrase, isOverviewQuestion };`)();
const route = JSON.parse(readFileSync(join(root, 'benchmark/golden/route.json'), 'utf8'));
const texts = new Set(route.flatMap(r => r.kind === 'session' ? r.qs : [r.q]));
const edge = ['', ' ', '\n', 'ท้อ', 'ท้อง', 'ท้อแท้', 'ท้อง ท้อ', 'เขา', 'เขาใจ', 'เขา ', 'ผลสอบของเขา', 'ผลสอบเขา', 'รหัส 12345678 ผล', 'รหัส 123456 ผล', 'รหัส1234567890ผล', 'ผลสอบของฉันที่ไหน', 'แล้วค่าเทอมล่ะ', 'ต้องใช้เอกสารอะไร', 'เกณฑ์ภาษาอังกฤษ', 'สอบวันไหน', 'เปิดรับไหม', 'ทุนมีไหม', 'ค่าเทอมโท', 'แล้วค่าเทอมโดยทั่วไปล่ะ', 'แล้วที่มหิดลล่ะ', '2018DG00 ค่าเทอม', 'ค่าธรรมเนียม   ', 'FEES', 'How Much Is The Tuition', '1 มิถุนายน 2569', '16 มกราคม–26 เมษายน 2570', '5–12 ก.ค. 2570', '13 ธ.ค.-20 ธ.ค. 2569 และ 4 ม.ค. 2570', '12345 มิถุนายน 2569', '31 ตุลาคม', '2 ส.ค.–26 ส.ค. 2570 22.00 น.', '0 มกราคม 2569', '32 มกราคม 2569', 'ตอนนี้ภาคเรียนอะไร', 'ตอนนี้ลาพักได้ไหม', 'ติดปัญหา วิทยานิพนธ์', 'ติดปัญหา\u200bวิทยานิพนธ์', 'TIDปัญหา', 'ช่วยด้วยเรื่องจบ', 'ปัญหาเรื่องการเงิน', 'เรื่องปัญหา', 'ที่ติดปัญหา', 'ติดปัญหาติดปัญหา', 'ผมเกรดเท่าไร', 'ช่วยด้วย', '  ยกเลิก  ', 'ยก เลิก', 'เริ่มใหม่ ครับ นะ', 'มีอะไรน่าสนใจบ้างที่นี่ที่นั่นที่โน่นที่ไหนก็ไม่รู้ยาวมากเกินสี่สิบตัวอักษรแน่นอน',
  'WHAT SHOULD I KNOW', 'What Should I Know', 'Anything Interesting', 'ａｂｃ１２３', '！？ａ', 'a　b', 'x­y', 'x‍y', 'x﻿y', 'x⁠y', 'x️y', 'x͏y', 'xㅤy', '\u{1F600}', 'a\u{1F600}b', 'a\u{1F468}‍\u{1F469}b', 'a❤️b', 'a✓b', 'a✔b', '©', '™', '↔', '⌚', 'กํา', 'กํ้า', 'ก้ิ', 'ก้็', 'ก้ัข', 'ก้ํ', 'กกก', 'กกกก', 'ะะะะ', '๏๏๏', 'aaa', 'aaaa', '  a   b  ', 'a\tb\nc', 'a b', 'a b', 'a\u0085b', '?!?!', 'ok???', 'ok ?!. ~', '~', 'ก ? ! . ~ ？ ！', '๐๑๒', '😀', 'é', 'é', 'Å', 'Å', 'ｱ', '漢字', 'ΑΒΓ', 'עברית'];
for (const e of edge) texts.add(e);
for (const e of JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'))) texts.add(e.answer);   // every manual answer: real Thai dates, long lines, newlines
const out = [...texts].map(t => ({ text: t, norm: F.normChat(t), wellbeing: F.wellbeingKind(t), personal: F.personalAsk(t), restart: F.isRestartPhrase(t), overview: F.isOverviewQuestion(t), study: F.hasStudyIntent(t), aspect: F.followUpAspect(t) || null, dateSpan: F.dateSpan(t), timeIntent: F.timeIntent(t), finder: F.isFinderQuestion(t), levelOnly: F.isLevelOnlyQuestion(t), enAsk: (() => { const r = F.englishProgrammeAsk(t); return r ? [r.name, r.topic] : null; })(), genericFee: F.isGenericFeeQuestion(t), stuck: (() => { const r = F.stuckTopic(t); return r === null ? null : r.cat ? r.cat.key : ''; })() }));
const kb = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
const picksFn = new Function('KB', `${todayBlock}\nreturn { datedPicks, isDatedSchedule, entrySpan };`)(kb);
const days = ['2026-01-15', '2026-05-12', '2026-06-01', '2026-07-20', '2026-10-31', '2026-11-07', '2026-12-16', '2027-01-10', '2027-07-06', '2027-08-15', '2028-03-01'];
const picks = [];
for (const intent of ['registration', 'admissions', 'any']) for (const today of days) picks.push({ intent, today, picks: picksFn.datedPicks(kb, intent, today).map(p => [p.e.id, p.state]) });
writeFileSync(join(root, 'benchmark/golden/dated_picks.json'), '[\n' + picks.map(o => JSON.stringify(o)).join(',\n') + '\n]\n');
console.log(`wrote ${picks.length} datedPicks cases -> benchmark/golden/dated_picks.json (${kb.filter(picksFn.isDatedSchedule).length} dated entries)`);
writeFileSync(join(root, 'benchmark/golden/route_text.json'), '[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n]\n');
console.log(`wrote ${out.length} texts -> benchmark/golden/route_text.json`);
