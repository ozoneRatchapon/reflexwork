// No page may use an inline handler (CSP, QA F65). Kept from before: an inline handler (onclick="fn(...)") can only call a GLOBAL function. In a <script type="module"> nothing is global unless it is put on
// window - the 👍/👎 buttons threw "ReferenceError: sendFeedback is not defined" on every click for exactly this reason.
// Run: node tests/inline_handlers.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
// Since QA F65 every page has a hash-based CSP that refuses inline handlers, so there must be none at all (pages-csp also refuses them).
for (const f of readdirSync(dir).filter(n => n.endsWith('.html'))) {
  const h = readFileSync(join(dir, f), 'utf8');
  const inline = [...h.matchAll(/\bon(?:click|change|input|submit|keydown|keyup|error|load)=["'`\\$]/g)].length;
  check(`${f}: no inline event handlers (the CSP would refuse them)`, inline === 0, `${inline} found: use addEventListener / data-act`);
  const names = [...new Set([...h.matchAll(/\bon(?:click|change|input|submit|keydown|keyup)="([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]))];
  if (!names.length) continue;
  const moduleOnly = /<script type="module"/.test(h) && !/<script(?![^>]*type=)[^>]*>/.test(h);
  for (const n of names) {
    const exposed = new RegExp(`(?:window|globalThis)\\.${n.replace('$', '\\$')}\\s*=`).test(h);
    const defined = new RegExp(`function\\s+${n.replace('$', '\\$')}\\s*\\(`).test(h);
    check(`${f}: onclick="${n}(...)" is reachable ${moduleOnly ? '(module page: must be on window)' : '(classic script: global)'}`, exposed || (!moduleOnly && defined), `${defined || exposed ? '' : 'not defined; '}${moduleOnly && !exposed ? 'module scope only: put it on window' : ''}`);   // window.fn = ... counts as both definition and exposure
  }
}
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
