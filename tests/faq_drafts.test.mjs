// The 14 draft FAQ entries for the manual owner (docs/kb-faq-drafts/) must stay drafts: never approved, never in the index the chat serves,
// each one verbatim-sourced (FAQ number + source URL).   Run: node tests/faq_drafts.test.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dir = join(root, 'docs/kb-faq-drafts');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const files = readdirSync(dir).filter(f => /^faq_\d{3}\.md$/.test(f));
const fm = f => Object.fromEntries([...readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1].matchAll(/^(\w+): "(.*)"$/gm)].map(m => [m[1], m[2]]));
check('14 drafts, one per uncovered student FAQ item', files.length === 14, String(files.length));
const meta = files.map(f => [f, fm(f)]);
check('every draft is approval_status "draft"', meta.every(([, m]) => m.approval_status === 'draft'), meta.filter(([, m]) => m.approval_status !== 'draft').map(([f]) => f).join());
check('every draft names its FAQ number and the official source', meta.every(([f, m]) => m.source_faq_number === String(Number(f.match(/\d{3}/)[0])) && /^https:\/\/graduate\.mahidol\.ac\.th\/engine\/structure\/faq\//.test(m.source_url) && m.title && m.faq_owner));
check('they are exactly the student FAQ items the knowledge base did not cover', (() => { const f = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items; const want = f.filter(r => r.student && !r.gold_kb_ids.length).map(r => Number(r.id)).sort((a, b) => a - b).join();
  return want === meta.map(([, m]) => Number(m.source_faq_number)).sort((a, b) => a - b).join(); })());
const idx = join(root, 'submissions/ui/knowledge-index.json');
check('none of them is in the index the chat serves (no faq_NNN ids)', !existsSync(idx) || !JSON.parse(readFileSync(idx, 'utf8')).some(e => /^faq_\d{3}$/.test(e.id)));
check('none was copied into the published knowledge folder', !readdirSync(join(root, 'submissions/ui/knowledge-public')).some(f => /^faq_\d{3}\.md$/.test(f)));
check('the owner review sheet exists and states the measured conflicts', existsSync(join(dir, 'README.md')) && /อนุมัติเฉยๆ ไม่พอ/.test(readFileSync(join(dir, 'README.md'), 'utf8')));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
