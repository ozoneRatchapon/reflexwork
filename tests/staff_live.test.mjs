// Live staff answers (2026-11-03): approve in the dashboard -> in the chat within seconds, labelled, retractable.
// Static guards over the kernel, chat and dashboard. The full loop (draft -> approve -> chat shows the badge -> retract -> gone)
// was run against `wrangler dev --local` in a headless browser. Run: node tests/staff_live.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const k = read('integrations/kernel-worker/worker.mjs'), chat = read('submissions/ui/chatbot.html'), dash = read('submissions/ui/dashboard.html');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
// kernel
const guard = k.indexOf("if (url.pathname.startsWith('/kb-'))"), live = k.indexOf("url.pathname === '/live-kb'"), retract = k.indexOf("url.pathname === '/kb-retract'");
check('GET /live-kb is public (routed before the staff-token guard)', live > 0 && live < guard);
check('POST /kb-retract is staff-only (routed after the guard)', retract > guard);
check('the browser may send X-Staff-Token (CORS) — without it every dashboard staff call was blocked', /'Access-Control-Allow-Headers': 'Content-Type, X-Staff-Token'/.test(k));
check('approve sets status live with time and approver', /SET status='live', approved_at=\?2, approved_by=\?3/.test(k));
check('only status live is published (old "approved" test rows stay private)', /FROM kb_draft WHERE status='live'/.test(k) && !/WHERE status='approved'/.test(k));
check('retract only touches live rows', /SET status='retracted' WHERE id=\?1 AND status='live'/.test(k));
check('auto-draft never stores the proxy\'s "AI unavailable" apology as a draft', /j\.source === 'fallback' \? '' :/.test(k));
check('live list is not cached', /'Cache-Control': 'no-store'/.test(k));
// chat
check('chat merges live answers, refreshed every 15 s and when the tab comes back', /setInterval\(\(\)=>\{ if\(!document\.hidden\) refreshLiveKb\(\); \}, 15000\)/.test(chat) && /visibilitychange/.test(chat));
check('a refresh replaces, never duplicates (KB.filter(!staff).concat(live))', /KB = KB\.filter\(e=>!e\.staff\)\.concat\(live\)/.test(chat));
check('staff titles lose markup characters (they are interpolated in bubbles)', /title:String\(e\.title\|\|e\.question\|\|''\)\.replace\(\/\[<>"'&`\]\/g,''\)/.test(chat));
check('a staff answer is labelled in the bubble and gets its own badge', /📝 คำตอบที่เจ้าหน้าที่เพิ่ม/.test(chat) && /'📝 เจ้าหน้าที่ตอบ'/.test(chat));
check('no kernel configured (other agencies) = no live answers', /async function refreshLiveKb\(\)\{\n  if\(!KERNEL_API\)\{ LIVE_SETTLED=true; return; \}/.test(chat));
// QA G07 / G09 / G11 / G12 / G13
check('G11: only the latest /live-kb request writes KB (sequence counter)', /const my=\+\+LIVE_SEQ;/.test(chat) && /if\(my!==LIVE_SEQ \|\| !j/.test(chat));
check('G12: an early question waits (<= 1.5 s) for the first live refresh', /LIVE_READY = Promise\.race\(\[refreshLiveKb\(\), new Promise\(r=>setTimeout\(r,1500\)\)\]\)/.test(chat) && /if\(typed && ready && !LIVE_SETTLED\)/.test(chat));
check('G09: the staff approval date is the Bangkok calendar day', /_pDate\(_bkkIso\(hit\.approved_at\)\)/.test(chat) && !/approved_at\)\.toISOString/.test(chat));
check('G13: no same-category top-up after a staff answer; retracted chips say so', /cur\.category && !cur\.staff/.test(chat) && /คำตอบนี้ถูกถอนแล้ว/.test(chat));
check('G07: search() applies the staff-supersede step to both engines', /function search\(q\)\{ return _staffSupersede\(_searchRaw\(q\)\); \}/.test(chat));
check('G14: a staff answer keeps its own lines (staffBody), not answerPoints bullets', /if\(hit\.staff\) return staffTag \+ staffBody\(hit, q\);/.test(chat) && /const _SHOW_STAFF=8;/.test(chat));
check('G35: _askCore binds add() to its own question and number', /const myTurn=\+\+askSeq, add=\(cls, html\)=>_add\(cls, html, typed, myTurn\);/.test(chat) && /const qsrc = askedQ !== undefined \? askedQ : lastUserQ/.test(chat));
// behaviour of the two pure helpers, evaluated from the page source
const fnSrc = name => { const i = chat.indexOf(`function ${name}(`); let d = 0, j = chat.indexOf('{', i); for (let k2 = j; k2 < chat.length; k2++) { if (chat[k2] === '{') d++; else if (chat[k2] === '}' && --d === 0) return chat.slice(i, k2 + 1); } };
const _bkkIso = new Function(fnSrc('_bkkIso') + '; return _bkkIso;')();
check('G09: 17:30Z = 4 Nov 2026 in Bangkok', _bkkIso(Date.UTC(2026, 10, 3, 17, 30)) === '2026-11-04', _bkkIso(Date.UTC(2026, 10, 3, 17, 30)));
check('G09: 20:00Z on 31 Dec 2025 = 1 Jan 2026 in Bangkok', _bkkIso(Date.UTC(2025, 11, 31, 20, 0)) === '2026-01-01');
const sup = new Function(fnSrc('_cosToScore') + ';' + fnSrc('_staffSupersede') + '; return _staffSupersede;')();
const M = { title: 'T', staff: false }, S = { title: 'T', staff: true }, O = { title: 'other' };
const r1 = sup([{ e: M, cos: 0.6, overlap: 9, s: 3 }, { e: S, cos: 0.6, overlap: 9, s: 3 }, { e: O, cos: 0.2, overlap: 2, s: 1 }]);
check('G07: an exact staff/manual tie puts the staff entry first and drops the manual twin', r1[0].e === S && !r1.some(r => r.e === M) && r1.length === 2);
check('G07: the superseding staff entry is rescored against the new runner-up (no tie picker)', r1[0].s > 3, String(r1[0].s));
const r2 = sup([{ e: M, cos: 0.7, overlap: 9, s: 5 }, { e: S, cos: 0.6, overlap: 9, s: 3 }]);
{ const LINKS = [], linkify = x => x, slotLead = () => '';
  const staffBody = new Function('LINKS', 'linkify', 'slotLead', 'const _SHOW_STAFF=8;' + fnSrc('staffBody') + '; return staffBody;')(LINKS, linkify, slotLead);
  const out = staffBody({ staff: true, answer: '1. เข้าระบบ\n2. เลือกเมนู\n\n3. กรอก\n4. ชำระเงิน\n5. รออีเมล\n- ข้อแนะนำ\n## หัวข้อ\n**สำคัญ** เก็บใบเสร็จ' }, '');
  check('G14: numbered steps keep their numbers and all 8 lines show (no fold)', /\n4\. ชำระเงิน\n5\. รออีเมล/.test(out) && !/details/.test(out), out);
  check('G14: a 9th line folds as "อ่านเพิ่มอีก 1 บรรทัด"', /อ่านเพิ่มอีก 1 บรรทัด/.test(staffBody({ staff: true, answer: Array.from({ length: 9 }, (_, i) => `บรรทัด ${i + 1}`).join('\n') }, '')));
  check('G14: list markers become "• ", markdown hashes and ** are dropped', /\n• ข้อแนะนำ\nหัวข้อ\nสำคัญ เก็บใบเสร็จ$/.test(out), out); }
check('G07: a manual entry that matches better than the staff one is left alone', r2[0].e === M && r2.length === 2);
// dashboard
check('dashboard: answer form, approve-and-publish, live list with retract', /saveAnswer\(true\)/.test(dash) && /function renderLive/.test(dash) && /retractLive\(\$\{Number\(d\.id\)\|\|0\}\)/.test(dash));
check('dashboard: "ตอบ" on a gap row fills the form (escaped data attribute)', /class="ans-btn" data-q="\$\{esc\(e\.question\)\}"/.test(dash));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
