// The chat page's "AI understands, the manual answers" step. Runs the real understand() from chatbot.html with a fake search,
// and checks the guards around it. Run: node tests/understand_step.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = page.match(/function understand\(phrases\)\{[\s\S]*?\n\}\n/);
check('understand() found', !!src);
const E = id => ({ id, title: 'T-' + id });
const table = { 'ลาพัก': [{ e: E('leave'), s: 6 }, { e: E('quit'), s: 2 }], 'พักเรียน': [{ e: E('leave'), s: 5 }],
  'กำกวม': [{ e: E('a'), s: 5 }, { e: E('b'), s: 4 }], 'อ่อน': [{ e: E('weak'), s: 3 }], 'ลาออก': [{ e: E('quit'), s: 6 }] };
const understand = new Function('search', src[0] + 'return understand;')(p => table[p] || []);
const one = understand(['ลาพัก', 'พักเรียน']);
check('phrases agreeing on one clear entry -> answer it', one.kind === 'one' && one.entry.id === 'leave' && one.score === 6 && one.via === 'ลาพัก', JSON.stringify(one));
check('"not this" alternatives exclude the chosen entry', one.others.every(e => e.id !== 'leave') && one.others.some(e => e.id === 'quit'));
check('one clear hit among several phrases is NOT enough (measured: wrong 2 of 6)', understand(['ลาพัก', 'อ่อน']).kind === 'none');
check('a single-phrase reply with a clear hit is enough', understand(['ลาออก']).kind === 'one');
check('a close runner-up (lead < 2) is not an answer', understand(['กำกวม']).kind === 'none');
check('a weak match (score < 4) is not an answer', understand(['อ่อน']).kind === 'none');
check('phrases pointing at different entries -> offer them, do not pick', (u => u.kind === 'many' && u.entries.length === 2)(understand(['ลาพัก', 'ลาออก'])));
check('no phrases (model down / NONE) -> old behaviour', understand([]).kind === 'none');
check('?ai=off and no proxy skip the AI step entirely', /if\(!LLM_API \|\| AI_OFF\)\{ showNotFound\(\); return; \}/.test(page) && /async function rewriteQuery\(q\)\{\n  if\(!LLM_API \|\| AI_OFF\) return \[\];/.test(page));
check('the answer text is the manual entry (kbBody), never model text', /\$\{kbBody\(hit, q\)\}<\/div>\n      \$\{kbSteps\(hit\)\}/.test(page));
check('the student sees how the question was read, with a way out', /VOICE\.understoodLead\} <b>\$\{_lEsc\(hit\.title\)\}<\/b> <span class="dis" id="\$\{uid\}">\$\{VOICE\.notThis\}/.test(page));
check('the rewrite call has a timeout', /\/rewrite',\{[\s\S]{0,200}AbortSignal\.timeout\(9000\)/.test(page));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
