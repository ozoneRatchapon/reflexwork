// The AI's reply arrives with a little markdown. mdLite() (submissions/ui/chatbot.html) turns **bold** and "* " bullets into HTML AFTER the text has
// been escaped, so it must never let the model inject markup. Run: node tests/md_lite.test.mjs   (exit 0 = pass, 1 = fail)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const m = html.match(/function mdLite\(html\)\{[^\n]*\}/);
check('mdLite found in the page', !!m); if (!m) process.exit(1);
const mdLite = new Function(m[0] + '\nreturn mdLite;')();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // what linkify does to untrusted text
check('bold becomes <b>', mdLite('a **b** c') === 'a <b>b</b> c', mdLite('a **b** c'));
check('bold may span a line break (as the model writes it)', mdLite('**1.\nเอกสาร**') === '<b>1.\nเอกสาร</b>');
check('"* " and "- " bullets become a bullet', mdLite('* หนึ่ง\n- สอง') === '• หนึ่ง\n• สอง');
check('a lone asterisk or a multiplication is left alone', mdLite('2 * 3 = 6 และ 5*4') === '2 * 3 = 6 และ 5*4');
check('plain text and citations are unchanged', mdLite('ตาม [1] และ [2]') === 'ตาม [1] และ [2]');
const evil = mdLite(esc('**<img src=x onerror=alert(1)>** * <script>alert(1)</script>'));
check('injected markup stays escaped (no tag survives except our <b>)', !/<(?!\/?b>)/.test(evil), evil);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
