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
const F = new Function(`${norm}\n${wb}\n${pers}\n${overview}\n${restart}\nreturn { normChat, wellbeingKind, personalAsk, isRestartPhrase, isOverviewQuestion };`)();
const route = JSON.parse(readFileSync(join(root, 'benchmark/golden/route.json'), 'utf8'));
const texts = new Set(route.flatMap(r => r.kind === 'session' ? r.qs : [r.q]));
const edge = ['', ' ', '\n', 'ท้อ', 'ท้อง', 'ท้อแท้', 'ท้อง ท้อ', 'เขา', 'เขาใจ', 'เขา ', 'ผลสอบของเขา', 'ผลสอบเขา', 'รหัส 12345678 ผล', 'รหัส 123456 ผล', 'รหัส1234567890ผล', 'ผลสอบของฉันที่ไหน', 'ผมเกรดเท่าไร', 'ช่วยด้วย', '  ยกเลิก  ', 'ยก เลิก', 'เริ่มใหม่ ครับ นะ', 'มีอะไรน่าสนใจบ้างที่นี่ที่นั่นที่โน่นที่ไหนก็ไม่รู้ยาวมากเกินสี่สิบตัวอักษรแน่นอน',
  'WHAT SHOULD I KNOW', 'What Should I Know', 'Anything Interesting', 'ａｂｃ１２３', '！？ａ', 'a　b', 'x­y', 'x‍y', 'x﻿y', 'x⁠y', 'x️y', 'x͏y', 'xㅤy', '\u{1F600}', 'a\u{1F600}b', 'a\u{1F468}‍\u{1F469}b', 'a❤️b', 'a✓b', 'a✔b', '©', '™', '↔', '⌚', 'กํา', 'กํ้า', 'ก้ิ', 'ก้็', 'ก้ัข', 'ก้ํ', 'กกก', 'กกกก', 'ะะะะ', '๏๏๏', 'aaa', 'aaaa', '  a   b  ', 'a\tb\nc', 'a b', 'a b', 'a\u0085b', '?!?!', 'ok???', 'ok ?!. ~', '~', 'ก ? ! . ~ ？ ！', '๐๑๒', '😀', 'é', 'é', 'Å', 'Å', 'ｱ', '漢字', 'ΑΒΓ', 'עברית'];
for (const e of edge) texts.add(e);
const out = [...texts].map(t => ({ text: t, norm: F.normChat(t), wellbeing: F.wellbeingKind(t), personal: F.personalAsk(t), restart: F.isRestartPhrase(t), overview: F.isOverviewQuestion(t) }));
writeFileSync(join(root, 'benchmark/golden/route_text.json'), '[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n]\n');
console.log(`wrote ${out.length} texts -> benchmark/golden/route_text.json`);
