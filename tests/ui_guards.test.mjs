// Static guards for UI fixes from plan 003 (browser-verified by hand: long text, one vote per answer, retry after a failed vote). Run: node tests/ui_guards.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
