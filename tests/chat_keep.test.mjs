// The conversation survives a reload in the same tab, never leaves the tab, and the 🗑️ button wipes it (QA G28); a follow-up about
// the programme just shown ('แล้วค่าเทอมล่ะ') is not swallowed by the generic fee finder (regression from 3eba860).
// Run: node tests/chat_keep.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const h = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const mod = h.slice(h.indexOf('const CHAT_KEY='), h.indexOf('function paintBar(){'));
check('G28: kept in sessionStorage only (one tab, gone when it closes) - never localStorage, never sent anywhere', /sessionStorage\.setItem\(CHAT_KEY/.test(mod) && !/localStorage/.test(mod) && !/fetch\(/.test(mod));
check('G28: the snapshot drops spinners, votes and element ids (no duplicate votes, no id clashes)', /m\.classList\.contains\('pending'\)/.test(mod) && /'\.fb,\.dis-filter-wrap,\.hyb-wait,\.typing,\.skel'/.test(mod) && /querySelectorAll\('\[id\]'\)\.forEach\(x=>x\.removeAttribute\('id'\)\)/.test(mod));
check('G28: size is capped', /CHAT_MAX=30, CHAT_MAX_CHARS=300000/.test(mod) && /items\.slice\(-CHAT_MAX\)/.test(mod));
check('G28: restored after the greeting, with the follow-up programme brought back when the catalogue loads', /restoreChat\(\); watchChat\(\);/.test(h) && /if\(_PCTX_RESTORE && !PCTX\) PCTX=PROG\.find\(p=>p\.code===_PCTX_RESTORE\)/.test(h));
check('G28: a reload right after an answer still keeps it (pagehide flush)', /addEventListener\('pagehide', \(\)=>\{ if\(ready\) saveChatNow\(\); \}\)/.test(mod));
check('G28: restored chips ask through one delegated listener', /e\.target\.closest\('\.msg\[data-restored\] \.dis'\)/.test(mod));
check('G28: the clear button wipes chat, evidence, follow-up context and the stored copy', /<button type="button" id="clear-chat"/.test(h) && /function clearChat\(\)\{[\s\S]*?sessionStorage\.removeItem\(CHAT_KEY\)[\s\S]*?\$\('ev-list'\)[\s\S]*?PCTX=null; PIN=null;/.test(mod));
check('the note under the input says the history stays in this tab', /ประวัติแชตเก็บในแท็บนี้เท่านั้น/.test(h));
check('follow-up "แล้วค่าเทอมล่ะ" after a programme card skips the generic fee finder', /isGenericFeeQuestion\(q\) && !\(PCTX && followUpAspect\(q\)\)\)\{/.test(h));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
