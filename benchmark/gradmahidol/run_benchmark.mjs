// Benchmark ReflexWork's neurosymbolic KB search against the GradMahidol AI
// corpus (another Mahidol team's knowledge markdown, public announcements only,
// no PII — see docs/pitching/70-field-evidence-gradmahidol.md for provenance
// and the permission/PDPA guardrails).
//
// WHAT IT MEASURES
//   1. How many of their 62 FAQ-style docs convert into usable KB entries
//   2. Fast-path recall@1 / @3 on real user questions drawn from the team's
//      own LINE/chat test logs (Turnitin, registration, late fee, leave, etc.)
//   3. Abstain correctness on off-corpus junk
//
// WHY IT MATTERS FOR THE PITCH
//   Turns our fast-path ratio from a design projection into a number measured on
//   an independent, real Mahidol corpus — answering judge Q2/Q3 honestly.
//
// USAGE
//   CORPUS=/abs/path/to/gm-corpus/knowledge node benchmark/gradmahidol/run_benchmark.mjs
//
// This reuses the SAME _jsSearch algorithm extracted from chatbot.html, so the
// benchmark exercises production search, not a copy.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const htmlPath = join(root, 'submissions/ui/chatbot.html');
const CORPUS = process.env.CORPUS;

if (!CORPUS || !existsSync(CORPUS)) {
  console.error('Set CORPUS=/abs/path/to/gm-corpus/knowledge (dir of *.md). Got:', CORPUS);
  process.exit(2);
}

// ---- 1. Walk corpus, parse frontmatter + body into KB entries -------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}
const FM = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
function parseFm(block) {
  const fm = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-z_0-9]+):\s*"?(.*?)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}
// EXCLUDE_CURRICULUM=1 drops the 378 program-catalogue templates (a separate
// "program lookup" mode, not FAQ fast-path) to measure fast-path fairly on the
// 62 FAQ-style docs it is actually meant to serve.
const EXCLUDE_CURRICULUM = process.env.EXCLUDE_CURRICULUM === '1';
const files = walk(CORPUS);
const KB = [];
let noFm = 0, metaDoc = 0, excluded = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const m = text.match(FM);
  if (!m) { noFm++; continue; }
  const fm = parseFm(m[1]);
  const body = m[2].trim();
  // Skip meta/review docs (no title, or titled as a review log)
  if (!fm.title) { metaDoc++; continue; }
  if (EXCLUDE_CURRICULUM && fm.category === 'curriculum') { excluded++; continue; }
  // First substantive paragraph = answer summary (same rule as our builder)
  const paras = body.split('\n\n').map(p => p.trim()).filter(Boolean);
  let answer = '';
  for (const p of paras) { if (p.startsWith('##') || p.startsWith('|')) continue; answer = p; break; }
  KB.push({
    id: fm.source_faq_id || f.split('/').slice(-1)[0].replace('.md', ''),
    title: fm.title,
    category: fm.category || '',
    keywords: (fm.title + ' ' + (fm.source_name || '')).toLowerCase(),
    answer,
    source_url: fm.source_url || '',
    approval_status: fm.approval_status || '',
  });
}

// ---- 2. Extract production _jsSearch from chatbot.html --------------------
const html = readFileSync(htmlPath, 'utf8');
const sm = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/);
if (!sm) { console.error('could not extract _jsSearch from chatbot.html'); process.exit(1); }
const block = sm[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;');
const search = new Function('KB', block)(KB);

// ---- 3. Real user questions from the team's own chat/LINE test logs -------
// Labeled by the category the right answer lives in (we match on category
// because their doc ids are opaque). null = off-corpus → must abstain.
const CASES = [
  // thesis / submission (from Radtiya's 10/30 tests)
  ['ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน', 'thesis_submission'],
  ['ส่ง Turnitin เกินเท่าไหร่ถึงไม่ผ่าน', 'thesis_submission'],
  ['ขอเปลี่ยนหัวข้อวิทยานิพนธ์ทำยังไง', 'thesis_submission'],
  ['การอ้างอิงใช้ APA หรือ Vancouver', 'thesis_submission'],
  // registration (from 10/30 registration test batch)
  ['ลงทะเบียนภาคปลาย 2569 วันไหน', 'registration'],
  ['ลืมลงทะเบียนตามกำหนด ลงย้อนหลังได้ไหม', 'registration'],
  ['ลาพักการศึกษาต้องยื่นยังไง', 'registration'],
  ['ขอ transcript ออนไลน์ได้ไหม', 'registration'],
  // admissions (from 10/28 admission test)
  ['อยากเรียนต่อต้องสมัครยังไง', 'admissions'],
  ['ค่าสมัครเท่าไหร่', 'admissions'],
  // student affairs / scholarship (from 10/28)
  ['มีทุนเรียนต่อปริญญาเอกไหม', 'student_affairs'],
  // off-corpus junk → must abstain (null)
  ['วันนี้อากาศเป็นยังไง', null],
  ['ร้านกาแฟใกล้ ม. ที่ไหนอร่อย', null],
];

// ---- 4. Score --------------------------------------------------------------
let r1 = 0, r3 = 0, absOk = 0, absTot = 0, answerable = 0;
const rows = [];
for (const [q, cat] of CASES) {
  // _jsSearch returns ranked [{e, s, cos, overlap}]; the entry is in .e
  const raw = (search(q) || []).slice(0, 3);
  const res = raw.map(r => r.e || r);
  if (cat === null) {
    absTot++;
    // Abstain = nothing confident (empty, or best blended score below the gate)
    const best = raw[0];
    const abstained = raw.length === 0 || (best && typeof best.s === 'number' && best.s < 3);
    if (abstained) absOk++;
    rows.push([q, 'OFF-CORPUS', abstained ? `abstained ✓ (top s=${best ? best.s.toFixed(1) : '-'})` : `returned ${res[0]?.title?.slice(0,20)} ✗`]);
    continue;
  }
  answerable++;
  const top = res[0];
  const hit1 = top && top.category === cat;
  const hit3 = res.some(e => e.category === cat);
  if (hit1) r1++;
  if (hit3) r3++;
  rows.push([q, cat, `@1 ${hit1 ? '✓' : '✗'} @3 ${hit3 ? '✓' : '✗'}  top=${top ? top.category + ':' + (top.title||'').slice(0,26) : 'none'}`]);
}

// ---- 5. Report -------------------------------------------------------------
console.log('=== ReflexWork × GradMahidol corpus benchmark ===\n');
console.log(`corpus files scanned : ${files.length} md`);
console.log(`  no frontmatter     : ${noFm}`);
console.log(`  meta/review (skip) : ${metaDoc}`);
if (EXCLUDE_CURRICULUM) console.log(`  curriculum excluded: ${excluded} (program-lookup mode, not fast-path)`);
console.log(`KB entries built     : ${KB.length}`);
const byCat = {};
for (const e of KB) byCat[e.category] = (byCat[e.category] || 0) + 1;
console.log('  by category        :', JSON.stringify(byCat));
console.log('');
for (const [q, cat, r] of rows) console.log(`  [${cat}] ${q}\n      → ${r}`);
console.log('');
console.log(`recall@1 (answerable) : ${r1}/${answerable} = ${(100*r1/answerable).toFixed(0)}%`);
console.log(`recall@3 (answerable) : ${r3}/${answerable} = ${(100*r3/answerable).toFixed(0)}%`);
console.log(`abstain correct       : ${absOk}/${absTot}`);
