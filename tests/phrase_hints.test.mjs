// When the AI's search phrases do not agree on one entry, the not-found reply suggests what each phrase clearly pointed at
// instead of the generic starting points; nothing is answered (QA F29).   Run: node tests/phrase_hints.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch } from '../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')), search = pageSearch(KB, html);
const src = html.match(/function phraseHints\(phrases\)\{[\s\S]*?\n\}\n/)[0];
const phraseHints = new Function('search', src + 'return phraseHints;')(search);
const h = phraseHints(['ชั่วโมงกิจกรรม soft skills', 'ค่าปรับส่งเล่มล่าช้า', 'ชั่วโมงกิจกรรม soft skills']);
check('F29: each clear phrase hit becomes one suggestion (deduplicated)', h.length === 2 && new Set(h.map(e => e.id)).size === 2, h.map(e => e.id).join());
check('F29: phrases that hit nothing give no suggestions (the generic starting points stay)', phraseHints(['zzqq', 'xxyy']).length === 0 && phraseHints([]).length === 0);
check('F29: the understand not-found passes the hints', /showNotFound\(u\.kind==='many' \? u\.entries : phraseHints\(phrases\)\)/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
