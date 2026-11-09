// Plan 008 step 4 in the chat: an approved fix replaces its manual entry (same id, the entry's source link), a new staff answer is
// added, a retracted fix brings the manual entry back. The real refreshLiveKb() from chatbot.html with a scripted /live-kb.
// Run: node tests/fix_overlay.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const fn = (html.match(/^async function refreshLiveKb\(\)\{[\s\S]*?\n\}\n/m) || [''])[0];
check('refreshLiveKb found', !!fn); if (!fn) process.exit(1);
const BASE = [{ id: 'fee', title: 'ค่าธรรมเนียม', answer: 'เก่า 1,200 บาท', keywords: 'ค่าธรรมเนียม', source_url: 'https://grad/fee', category: 'fees' },
  { id: 'days', title: 'ส่งเล่มกี่วัน', answer: '30 วัน', keywords: 'ส่งเล่ม', source_url: 'https://grad/days', category: 'thesis' }];
let reply = { entries: [] };
const make = new Function('BASE', 'fetchImpl', `let KB=BASE.slice(), KB_BASE=BASE, LIVE_N=0, LIVE_FIX=0, LIVE_SEQ=0, LIVE_SETTLED=false; const KERNEL_API='https://k.test';
  const renderNote=()=>{}; const fetch=fetchImpl; const AbortSignal={ timeout: () => undefined };
  ${fn}
  return { run: refreshLiveKb, get: () => ({ KB, LIVE_N, LIVE_FIX }) };`);
const page = make(BASE, async () => ({ ok: true, json: async () => reply }));

reply = { entries: [{ id: 7, title: 'ค่าธรรมเนียม', question: 'ค่าธรรมเนียม', answer: 'ใหม่ 1,500 บาท', keywords: 'fee', approved_at: 1, target_id: 'fee' },
  { id: 8, title: 'จอดรถ', question: 'ที่จอดรถ', answer: 'อาคาร 2', keywords: 'parking', approved_at: 1 }]};
await page.run(); let s = page.get();
const fee = s.KB.filter(e => e.id === 'fee');
check('the fix replaces its entry: one "fee", with the new answer, staff-labelled, the old source link', fee.length === 1 && /1,500/.test(fee[0].answer) && fee[0].staff === true && fee[0].source_url === 'https://grad/fee', JSON.stringify(fee));
check('a new staff answer is added with its own id', s.KB.some(e => e.id === 'staff_8' && /อาคาร 2/.test(e.answer)));
check('the other manual entries stay', s.KB.some(e => e.id === 'days' && e.answer === '30 วัน') && s.KB.length === 3, String(s.KB.length));
check('counts: 1 added, 1 fixed', s.LIVE_N === 1 && s.LIVE_FIX === 1, JSON.stringify([s.LIVE_N, s.LIVE_FIX]));
await page.run(); s = page.get();
check('a second refresh does not duplicate', s.KB.length === 3 && s.KB.filter(e => e.id === 'fee').length === 1);
reply = { entries: [] }; await page.run(); s = page.get();
check('retracted: the manual entry is back as published', s.KB.length === 2 && s.KB.find(e => e.id === 'fee').answer === 'เก่า 1,200 บาท' && !s.KB.find(e => e.id === 'fee').staff);
reply = { entries: [{ id: 9, title: 'x', answer: 'y', target_id: 'not_in_this_manual', approved_at: 1 }, { id: 10, title: 'z', answer: 'w', target_id: '<script>', approved_at: 1 }] };
await page.run(); s = page.get();
check('a fix of an unknown entry or a malformed target becomes a plain staff answer', s.KB.some(e => e.id === 'staff_9') && s.KB.some(e => e.id === 'staff_10' && e.fix_of === null) && s.LIVE_FIX === 0);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
