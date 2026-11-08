// A question that is only a degree level opens the finder at that level (QA F26); nothing that names a programme, a KB topic or
// a real field question does. Checked on the Rust route (plan 015 step 3b).   Run: node tests/level_only.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeOf, catalogue } from '../scripts/lib/rust_route.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const yes = ['ประกาศนียบัตร', 'ประกาศนียบัตรบัณฑิตชั้นสูง', 'ปริญญาโท', 'ปริญญาเอก', 'ปริญญาโท นานาชาติ ที่เปิดรับ', 'ป.โท', 'ป.เอก', 'มีปริญญาเอกอะไรบ้าง'];
const faq = JSON.parse(read('benchmark/field/faq_questions.json')).items.flatMap(i => [i.th, i.en]).filter(Boolean);
const no = ['สมัครปริญญาโท', 'ค่าเทอมปริญญาโท', 'ปริญญาโทใช้เวลากี่ปี', ...catalogue.PROG.map(p => p.title), ...catalogue.KB.map(e => e.title), ...faq];
check('F26: level-only phrasings open the finder', yes.every(q => routeOf(q) === 'finder'), yes.filter(q => routeOf(q) !== 'finder').map(q => `${q}=${routeOf(q)}`).join(' | '));
// a list-of-programmes question is a finder question by its own intent (as "list of programs" is), not by level: not a level-only case
const LIST_INTENT = ['Which programs are currently open for admission?'];
const bad = no.filter(q => routeOf(q) === 'finder' && !LIST_INTENT.includes(q));
check(`F26: none of ${no.length} programme / KB / field questions opens the finder`, bad.length === 0, bad.slice(0, 4).join(' | '));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
