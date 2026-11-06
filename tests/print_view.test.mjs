// Printing an answer gives the conversation only, readable, with every folded line (QA G25).   Run: node tests/print_view.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const m = html.match(/@media print\{([\s\S]*?)\n  \}\n<\/style>/); check('one @media print block in the page style', !!m); if (!m) process.exit(1);
const css = m[1];
const hidden = (css.match(/^\s*([^{]+)\{display:none !important\}/m) || [])[1] || '';
for (const sel of ['.rw-nav', '.ask', '.chips', '.evidence', '.followups', '.fb', '.bar', '.msg.pending']) check(`print hides ${sel}`, hidden.split(',').includes(sel), hidden);
check('print is black on white', /\.msg\.b[^{]*\{background:#fff !important;color:#000 !important/.test(css));
check('the fold summary is not printed', /details\.more>summary\{display:none\}/.test(css));
check('links are spelled out on paper', /a\[href\^="http"\]::after\{content:" \(" attr\(href\) "\)"/.test(css));
// behaviour: beforeprint opens closed folds in #chat, afterprint restores exactly those
const src = html.slice(html.indexOf('let _printOpened=[];'), html.indexOf('let _sgIdx=-1;'));
const ls = {}; const folds = [{ open: false }, { open: true }, { open: false }];
const doc = { querySelectorAll: sel => sel === '#chat details:not([open])' ? folds.filter(f => !f.open) : [] };
new Function('addEventListener', 'document', src)((t, f) => { ls[t] = f; }, doc);
ls.beforeprint(); const allOpen = folds.every(f => f.open); ls.afterprint();
check('beforeprint opens every closed fold, afterprint closes only those', allOpen && !folds[0].open && folds[1].open && !folds[2].open, JSON.stringify(folds));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
