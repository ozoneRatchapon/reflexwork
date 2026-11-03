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
check('no kernel configured (other agencies) = no live answers', /async function refreshLiveKb\(\)\{\n  if\(!KERNEL_API\) return;/.test(chat));
// dashboard
check('dashboard: answer form, approve-and-publish, live list with retract', /saveAnswer\(true\)/.test(dash) && /function renderLive/.test(dash) && /retractLive\(\$\{Number\(d\.id\)\|\|0\}\)/.test(dash));
check('dashboard: "ตอบ" on a gap row fills the form (escaped data attribute)', /class="ans-btn" data-q="\$\{esc\(e\.question\)\}"/.test(dash));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
