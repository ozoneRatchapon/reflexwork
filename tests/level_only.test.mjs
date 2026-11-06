// A question that is only a degree level opens the finder at that level (QA F26); nothing that names a programme, a KB topic or
// a real field question does.   Run: node tests/level_only.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), read = f => readFileSync(join(root, f), 'utf8');
const h = read('submissions/ui/chatbot.html');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const a = h.indexOf('const _P_LEVEL='), lv = h.slice(a, h.indexOf('\n', a)), pl = h.match(/function _pLevel[^\n]*/)[0];
const fill = h.match(/^const _P_LEVEL_FILL=.*$/m)[0], fn = h.match(/function isLevelOnlyQuestion[\s\S]*?\n  return [^\n]*\n/)[0];
const lo = new Function(lv + '\n' + pl + '\n' + fill + '\n' + fn + '\nreturn isLevelOnlyQuestion;')();
const yes = ['ประกาศนียบัตร', 'ประกาศนียบัตรบัณฑิตชั้นสูง', 'ปริญญาโท', 'ปริญญาเอก', 'ปริญญาโท นานาชาติ ที่เปิดรับ', 'ป.โท', 'ป.เอก', 'มีปริญญาเอกอะไรบ้าง'];
const P = JSON.parse(read('submissions/ui/programmes.json')).programmes, KB = JSON.parse(read('submissions/ui/knowledge-index.json'));
const faq = JSON.parse(read('benchmark/field/faq_questions.json')).items.flatMap(i => [i.th, i.en]).filter(Boolean);
const no = ['สมัครปริญญาโท', 'ค่าเทอมปริญญาโท', 'ปริญญาโทใช้เวลากี่ปี', ...P.map(p => p.title), ...KB.map(e => e.title), ...faq];
check('F26: level-only phrasings are recognised', yes.every(lo), yes.filter(q => !lo(q)).join(' | '));
check(`F26: none of ${no.length} programme / KB / field questions is level-only`, !no.some(lo), no.filter(lo).slice(0, 4).join(' | '));
check('F26: a level-only question skips the resolver and opens the finder', /isFinderQuestion\(q\) \|\| isLevelOnlyQuestion\(q\)\)\)\) \? null : resolveProgramme/.test(h) && /PROG\.length && \(isFinderQuestion\(q\) \|\| isLevelOnlyQuestion\(q\)\)\)\{ PCTX=null; renderFinder\(q, d, kstrip, '', true\)/.test(h));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
