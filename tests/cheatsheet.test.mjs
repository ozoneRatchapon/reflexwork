// The printed stage cheat sheet is generated from the pitch deck's tested numbers; the committed copy must be current and still carry the do-not-say list.
// Run: node tests/cheatsheet.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from '../scripts/gen_cheatsheet.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const cur = readFileSync(join(root, 'docs/pitching/cheatsheet.html'), 'utf8');
check('docs/pitching/cheatsheet.html is up to date with pitch.html (run node scripts/gen_cheatsheet.mjs)', cur === build());
check('it carries the demo texts the e2e rehearses', ['อยากสมัครเรียนชีวสารสนเทศทางการแพทย์', 'แล้วค่าเทอมล่ะ', 'ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน'].every(t => cur.includes(t)));
check('it carries the do-not-say list', /ห้ามพูด/.test(cur) && /“ไม่เดา”/.test(cur) && /ศาลแคนาดา/.test(cur) && /ไม่เคยทดสอบโหลด/.test(cur));
check('it fits one A4 page by construction (print size set, no page breaks)', /@page\{size:A4/.test(cur) && !/page-break|break-after/.test(cur));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
