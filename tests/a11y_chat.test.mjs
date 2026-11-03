// The chat must be usable with a screen reader: new answers are announced, the input has a name, and the page language is Thai.
// Static guard (Lighthouse accessibility 100 was measured on production on 2026-11-03). Run: node tests/a11y_chat.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
check('chat log announces additions politely', /<div class="chat" id="chat"[^>]*role="log"[^>]*aria-live="polite"/.test(html));
check('chat log has an accessible name', /<div class="chat" id="chat"[^>]*aria-label="[^"]+"/.test(html));
check('the question input has an accessible name', /<input id="q"[^>]*aria-label="[^"]+"/.test(html));
check('the question input is a combobox wired to the suggestion list', /id="q"[^>]*role="combobox"[^>]*aria-controls="sg"/.test(html));
check('page language is Thai', /<html lang="th"/.test(html));
check('the viewport allows zoom (no user-scalable=no)', !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?[,"]/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
