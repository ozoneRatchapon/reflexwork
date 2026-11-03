// Long choice lists get a type-to-filter box (request 2026-11-03). Static guards + the real normaliser.
// The click-through flow (finder -> faculty -> type -> Enter opens the only match) was checked in a headless browser.
// Run: node tests/choice_filter.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const norm = page.match(/const _fNorm=(s=>[^\n]*);/);
check('normaliser found', !!norm);
const _fNorm = eval(norm[1]);
check('tone marks, spaces and case are ignored', _fNorm('ทันตแพทย์ ศาสตร์') === _fNorm('ทันตแพทยศาสตร') && _fNorm('Public Health') === 'publichealth');
check('only lists longer than _FILTER_MIN (10) get a box', /const _FILTER_MIN=10;/.test(page) && /if\(chips\.length<=_FILTER_MIN/.test(page));
check('the "ดูทั้งหมด" chip is never filtered away', /\.dis:not\(\[data-fk=more\]\)/.test(page));
check('the box has an accessible name and says how many items', /inp\.placeholder=`พิมพ์เพื่อค้นหาใน \$\{chips\.length\} รายการ`; inp\.setAttribute\('aria-label', inp\.placeholder\)/.test(page));
check('no match says so instead of an empty list', /dis-none[\s\S]{0,200}ไม่พบในรายการนี้/.test(page));
check('Enter opens the item only when exactly one is left', /if\(vis\.length===1\) vis\[0\]\.click\(\)/.test(page));
check('attached to every bot bubble and to every finder redraw', /attachChoiceFilter\(d\);\n    requestAnimationFrame/.test(page) && /attachChoiceFilter\(el\); \};\n  draw\(\);/.test(page));
check('a box is not added twice to the same list', /previousElementSibling\.classList\.contains\('dis-filter-wrap'\)/.test(page));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
