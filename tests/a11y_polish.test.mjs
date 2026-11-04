// Small accessibility / robustness fixes on the chat page (QA F49 F51 F53 F58).   Run: node tests/a11y_polish.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
// F49: the arrow-key rule, run as code
const step = (idx, key, n) => key === 'ArrowDown' ? (idx + 1) % n : (idx < 0 ? n - 1 : (idx - 1 + n) % n);
check('F49: the page uses the arrow-key rule tested here', html.includes("_sgIdx = e.key==='ArrowDown' ? (_sgIdx+1)%n : (_sgIdx<0 ? n-1 : (_sgIdx-1+n)%n);"));
check('F49: ArrowUp from nothing selects the last option; Down from nothing the first; both wrap', step(-1, 'ArrowUp', 4) === 3 && step(-1, 'ArrowDown', 4) === 0 && step(3, 'ArrowDown', 4) === 0 && step(0, 'ArrowUp', 4) === 3);
check('F49: options carry aria-selected and the input points at the active one', /aria-selected="false">\$\{_lEsc\(t\)\}/.test(html) && /x\.setAttribute\('aria-selected',on\?'true':'false'\)/.test(html) && /setAttribute\('aria-activedescendant', items\[_sgIdx\]\.id\)/.test(html));
check('F49: closing or rebuilding the list clears aria-activedescendant', (html.match(/removeAttribute\('aria-activedescendant'\)/g) || []).length >= 2);
// F51 / F58
check('F51/F58: an inline favicon (no 404 per load)', /<link rel="icon" href="data:image\/svg\+xml,/.test(html));
check('F51: a skip link to the question box and a labelled nav', /<a class="skip" href="#q">/.test(html) && /<nav class="rw-nav" aria-label="[^"]+">/.test(html));
check('F51: the judge-view toggle is hidden but focusable', !/\.sw-toggle input\{display:none\}/.test(html) && /\.sw-toggle input:focus-visible \+ \.pip/.test(html));
check('F51: reduced motion also stops the mood bump, the proof flash and smooth scrolling', /\.mood\.bump \.mood-face,\.proof-full\.flash\{animation:none !important\}/.test(html) && /behavior:_REDUCED_MOTION\?'auto':'smooth'/.test(html));
// F53
check('F53: the answer logic reads at most 500 characters; typeahead at most 200', /normChat\(typed\.slice\(0,500\)\)/.test(html) && /\$\('q'\)\.value\.trim\(\)\.slice\(0,200\)/.test(html));
// F55
check('F55: no match among the shown chips opens "ดูทั้งหมด" and re-applies the typed text to the full list', /if\(!n && t && more && root\.isConnected\)\{[\s\S]*?more\.click\(\);[\s\S]*?fresh\.value=val; fresh\.dispatchEvent\(new Event\('input'\)\); fresh\.focus\(\);/.test(html));
// F50
check('F50: small grey text is #8493bd (>= 4.5:1 on every panel), not #6b7aa3', !/#6b7aa3/.test(html) && (html.match(/#8493bd/g) || []).length >= 3);
check('F50: phones get 44 px touch targets and a 16 px filter box', /@media \(max-width:560px\)\{ \.fb-b,\.chip,\.rw-nav a,\.msg\.b \.golink,\.dis\{min-height:44px\}/.test(html) && /\.dis-filter\{font-size:max\(16px,1rem\)\}/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
