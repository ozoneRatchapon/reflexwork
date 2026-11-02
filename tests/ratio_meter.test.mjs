// The on-page "answered from verified data" meter must be a plain COUNT. (It used to add up to +-18 points from 👍/👎 votes, so a
// reviewer reading "92 %" could not tell it was not measured.)   Run: node tests/ratio_meter.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const m = html.match(/\/\/ <ratio>([\s\S]*?)\/\/ <\/ratio>/); check('<ratio> block found', m); if (!m) process.exit(1);
const { ratioStats, satisfactionNote } = new Function(m[1] + '\nreturn {ratioStats, satisfactionNote};')();

check('the percentage is answered/total, exactly', ratioStats(3, 1).pct === 75 && ratioStats(0, 5).pct === 0 && ratioStats(7, 0).pct === 100 && ratioStats(1, 2).pct === 33);
check('no questions yet -> no percentage (nothing to show)', ratioStats(0, 0).pct === null && ratioStats(0, 0).total === 0);
check('votes cannot move the bar: updateRatio() reads only the counts', (() => { const u = html.match(/function updateRatio\(\)\{[\s\S]*?\n\}/)[0]; return /ratioStats\(auto, ai\)/.test(u) && !/BANDIT\.(ema|bias)/.test(u.replace(/satisfactionNote\(BANDIT\.ema, BANDIT\.n\)/, '')); })());
check('the old bias() is gone', !/bias\s*\(/.test(html.match(/const BANDIT = \{[\s\S]*?\n\};/)[0]) && !/BANDIT\.bias/.test(html));
check('the satisfaction score is shown separately and says it does not move the bar', /ไม่ปรับตัวเลข/.test(satisfactionNote(0.3, 3)) && /\+0\.30/.test(satisfactionNote(0.3, 3)) && /−1…\+1/.test(satisfactionNote(0.3, 3)));
check('no votes yet -> the note explains what is counted', /นับจากคำถามในเซสชันนี้/.test(satisfactionNote(0, 0)));
check('the savings figure is labelled as an estimate with its assumption', /ประหยัดโดยประมาณ \(฿2\/คำถาม\)/.test(html) && /ประมาณการ ไม่ใช่ค่าที่วัดจากบิลจริง/.test(html) && !/ประหยัดค่า AI:/.test(html));
check('the escalation counter no longer claims the question was sent to an AI', !/ส่ง AI:/.test(html) && /ไม่พบในคู่มือ \(ส่งต่อเจ้าหน้าที่\)/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
