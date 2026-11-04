// Text follows the user's browser / OS text size: no fixed px font sizes on the chat page (QA G29).   Run: node tests/text_size.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ui = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui', f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
for (const f of ['chatbot.html', 'theme.css']) {
  const src = ui(f).replace(/\/\*[\s\S]*?\*\//g, '');
  const px = [...src.matchAll(/font-size:\s*([^;"}]*)/g)].map(m => m[1]).filter(v => /\d(?:\.\d+)?px/.test(v.replace(/max\(16px,1rem\)/, '')));
  check(`${f}: no font size is fixed in px`, px.length === 0, px.slice(0, 5).join(' | '));
}
check('the root size is left to the user (no html/:root font-size)', !/(?:^|[\s}])(?:html|:root)\s*\{[^}]*font-size/.test(ui('chatbot.html') + ui('theme.css')));
check('the question box keeps a 16px floor (iOS zoom-on-focus) and still grows', /\.ask input\{[^}]*font-size:max\(16px,1rem\)/.test(ui('chatbot.html')));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
