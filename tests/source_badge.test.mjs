// The student-facing source badge ("ข้อมูลทางการ" vs "AI ช่วยเรียบเรียง") must follow the REAL route chip, never a tooltip or other text in the message.
// Regression: a tooltip mentioning "AI ช่วยเรียบเรียง" on the kernel strip made every answer look AI-rephrased. Run: node tests/source_badge.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const m = html.match(/const raw=html, ai=(\/(?:[^\/\\\n]|\\.)+\/)\.test\(raw\), official=(\/(?:[^\/\\\n]|\\.)+\/)\.test\(raw\);/);
check('badge regexes found in add()', !!m); if (!m) process.exit(1);
const AI = new Function('return ' + m[1])(), OFFICIAL = new Function('return ' + m[2])();
const strip = '<div class="kernel-strip"><span class="km" title="\u0e16\u0e49\u0e32\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e43\u0e0a\u0e49 AI \u0e0a\u0e48\u0e27\u0e22\u0e40\u0e23\u0e35\u0e22\u0e1a\u0e40\u0e23\u0e35\u0e22\u0e07 \u0e08\u0e30\u0e21\u0e35\u0e1b\u0e49\u0e32\u0e22">x</span></div>';
const kb = strip + '<span class="route auto">\u2705 \u0e15\u0e2d\u0e1a\u0e08\u0e32\u0e01\u0e04\u0e39\u0e48\u0e21\u0e37\u0e2d\u0e17\u0e31\u0e19\u0e17\u0e35 \u00b7 \u0e44\u0e21\u0e48\u0e40\u0e23\u0e35\u0e22\u0e01 AI</span><div class="ans">...</div>';
const hybrid = strip + '<span class="route auto">\ud83d\udd00 KB-grounded + AI \u0e0a\u0e48\u0e27\u0e22\u0e40\u0e23\u0e35\u0e22\u0e1a\u0e40\u0e23\u0e35\u0e22\u0e07 <span class="km">\u26a1 reflex</span></span><div class="ans">...</div>';
const fallback = strip + '<span class="route ai">\ud83e\udd14 not in the manual</span><div class="ans">\u0e02\u0e2d\u0e2d\u0e20\u0e31\u0e22\u0e04\u0e23\u0e31\u0e1a</div>';
check('a knowledge-base answer is NOT labelled AI-rephrased (tooltip in the strip must not count)', !AI.test(kb) && OFFICIAL.test(kb));
check('the AI-rephrase route IS labelled AI-rephrased', AI.test(hybrid));
check('a "not understood" fallback gets neither badge', !AI.test(fallback) && !OFFICIAL.test(fallback));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
