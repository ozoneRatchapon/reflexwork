// Static guards for UI fixes from plan 003 (browser-verified by hand: long text, one vote per answer, retry after a failed vote). Run: node tests/ui_guards.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeOf } from '../scripts/lib/rust_route.mjs';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { console.log((ok ? '✓' : '✗') + ' ' + n); ok ? pass++ : fail++; };
check('long unbroken text wraps inside the bubble', /\.msg\{[^}]*overflow-wrap:anywhere/.test(html));
check('answers scroll to below the sticky nav', /\.msg\{[^}]*scroll-margin-top:72px/.test(html));
check('the evidence toggle no longer overlaps on narrow screens', /@media \(max-width:720px\)\{ \.ev-toggle\{position:static/.test(html));
check('one vote per answer, restored for retry on failure', /if\(rec\.sent\) return;/.test(html) && /rec\.sent = false; el\.innerHTML = saved/.test(html) && /if\(!resp\.ok\) throw/.test(html));
check('a vote counts only after the server accepted it', html.indexOf('BANDIT.reward(reward > 0') > html.indexOf('if(!resp.ok) throw'));
check('AI text must be a string of sane length', /typeof j\.answer==='string'/.test(html) && /a\.length<=4000/.test(html));
check('IME composition does not send or move the typeahead', /compositionstart/.test(html) && /e\.keyCode===229/.test(html) && /if\(_ime\(e\)\) return;/.test(html));
const sd = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/student-desk.html'), 'utf8');
check('student-desk says it is a simulation and sends nothing', /ไม่ได้ส่งคำร้องจริง/.test(sd) && !/Bedrock/.test(sd) && !/>ส่งคำร้อง</.test(sd));
check('a greeting in front of a question does not swallow it', /function stripLeadIn/.test(html) && /stripLeadIn\(normChat\(typed(?:\.slice\(0,\d+\))?\)/.test(html));
check('restart phrases are whole-utterance only', /function isRestartPhrase[\s\S]*\^\(\?:ยกเลิก\|/.test(html));
// both decisions are Rust's since plan 015 step 4b (the manual's verdict: route/verdict.rs since plan 009 C4); the page only renders them
const branches = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'crates/reflex-wasm/src/route/verdict.rs'), 'utf8');
check('staff answers are not rephrased by the AI path', /top_score >= 6 \|\| ranked\.iter\(\)\.take\(OFFERED\)\.any\(\|r\| r\.entry\.staff\)\s*\{\s*Route::AdviceStrong/.test(branches) && /const OFFERED: usize = 3;/.test(branches) && /take\('advice_strong'\)/.test(html));
check('programme questions get an honest notice while the catalogue is loading or failed', ['loading', 'failed'].every(s => routeOf('อยากเรียนวิศวกรรม', { progState: s }) === 'catalogue_not_ready') && /PROG_STATE='failed'/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
