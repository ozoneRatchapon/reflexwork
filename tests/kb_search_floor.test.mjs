// CI regression floor for the neurosymbolic KB search, SELF-CONTAINED.
//
// Unlike kb_search.test.mjs (which needs the generated knowledge-index.json and
// silently skips when it's absent), this builds a tiny index DIRECTLY from our
// own committed knowledge-public/*.md fixtures, then pins recall@1/@3 and
// abstain floors so a future edit to search() can't silently regress them.
//
// Uses ONLY our own KB (public FAQ, approved) — no external corpus, no network,
// no generated artifact. Runs in CI on a clean checkout.
//
// Run: node tests/kb_search_floor.test.mjs   (exit 0 = pass, 1 = fail)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kbDir = join(root, 'submissions/ui/knowledge-public');
const htmlPath = join(root, 'submissions/ui/chatbot.html');

let pass = 0, fail = 0;
const ge = (name, got, floor) => { const ok = got >= floor; console.log((ok ? '✓' : '✗') + ` ${name} — ${got} (floor ${floor})`); ok ? pass++ : fail++; };

// --- Build index from our own KB markdown (same rules as build_knowledge_index.py)
const FM = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
function parseFm(block) {
  const fm = {};
  for (const line of block.split('\n')) { const m = line.match(/^([a-z_0-9]+):\s*"?(.*?)"?\s*$/); if (m) fm[m[1]] = m[2]; }
  return fm;
}
const KB = [];
for (const name of readdirSync(kbDir)) {
  if (!name.endsWith('.md')) continue;
  const text = readFileSync(join(kbDir, name), 'utf8');
  const m = text.match(FM);
  if (!m) continue;
  const fm = parseFm(m[1]);
  if (fm.approval_status !== 'approved') continue;
  const body = m[2].trim();
  const kw = (body.match(/คำค้นภาษาอังกฤษ:\s*(.+)/) || [])[1] || '';
  KB.push({ id: name.replace('.md', ''), title: fm.title || name, category: fm.category || '',
    keywords: ((fm.title || '') + ' ' + kw).toLowerCase() });
}
ge('KB fixtures loaded', KB.length, 50);

// --- Extract the production _jsSearch (same algorithm the page ships)
const html = readFileSync(htmlPath, 'utf8');
const sm = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/);
if (!sm) { console.log('✗ could not extract _jsSearch'); console.log(`\n${pass}/${pass+fail} passed`); process.exit(1); }
const search = new Function('KB', sm[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KB);

// --- Labeled cases over our own KB (category-level; null = off-corpus → abstain)
const CASES = [
  ['ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน', 'thesis_submission'],
  ['Turnitin เกิน 25% ทำยังไง', 'thesis_submission'],
  ['ลาพักการศึกษาต้องทำยังไง', 'registration'],
  ['ขอเปลี่ยนชื่อสกุลตอนเรียน', 'registration'],
  ['สมัครเรียนต่อยังไง', 'admission'],
  ['มีทุนอะไรบ้าง', 'scholarship'],
  ['ยื่นคะแนน IELTS ยังไง', 'english'],
  ['ลาพักการสึกษา', 'registration'],  // typo (misspelled สึกษา) — must still resolve
  ['วันนี้อากาศเป็นยังไง', null],
  ['ร้านกาแฟอร่อย', null],
];
let r1 = 0, r3 = 0, ans = 0, absOk = 0, absTot = 0;
for (const [q, cat] of CASES) {
  const ranked = (search(q) || []);
  const res = ranked.slice(0, 3).map(r => r.e || r);
  if (cat === null) { absTot++; const best = ranked[0]; if (!best || (best.s ?? 0) < 3) absOk++; continue; }
  ans++;
  if (res[0] && res[0].category === cat) r1++;
  if (res.some(e => e.category === cat)) r3++;
}
// Floors are set BELOW current measured values so normal drift passes but a real
// regression (algorithm broken) trips them. Current: @1 ~90%, @3 100%, abstain 2/2.
ge('recall@1', Math.round(100 * r1 / ans), 70);
ge('recall@3', Math.round(100 * r3 / ans), 90);
ge('abstain correct', absOk, absTot);

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
