#!/usr/bin/env node
// Golden contract for the Rust port (.plans/002_rust-core-migration.md, step 0).
// Freezes INPUTS together with the CURRENT JS OUTPUTS of the pure answer logic in chatbot.html, so a Rust implementation must
// reproduce them exactly before the page switches to it. Inputs are frozen in the files too, so the weekly catalogue refresh and
// KB rebuilds do not break the contract.
//   node scripts/golden_dump.mjs            write benchmark/golden/*.json from the current data + JS
//   node scripts/golden_dump.mjs --check    re-run the JS on the FROZEN inputs and fail on any difference (used by the test)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadChatbotFns, root } from './lib/chatbot_fns.mjs';
const F = loadChatbotFns(), DIR = join(root, 'benchmark/golden'), CHECK = process.argv.includes('--check');
const SLOT_QS = ['ส่งเล่มภายในกี่วัน', 'ค่าธรรมเนียมเท่าไหร่', 'turnitin เกินกี่ %', 'ทำยังไง'];
const lines = f => readFileSync(join(root, f), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));

// --- outputs from inputs (the contract) ---
const outPoints = inp => inp.map(e => ({ ...e, points: F.answerPoints(e.answer), slot: Object.fromEntries(SLOT_QS.map(q => [q, F.slotLead(e, q)])) }));
const outProg = inp => inp.map(p => { const s = F._pSchedule(p.schedule_lines), f = F._pFee(p.fee_lines);
  return { ...p, schedule: { cols: s.cols, rows: s.rows, notes: s.notes, list: s.list }, fee: f }; });
const pick = r => r ? { kind: r.kind, codes: r.row ? [r.row.code] : (r.rows || []).map(x => x.code), topic: r.topic || '', via: r.via || '', levelMissing: !!r.levelMissing, total: r.total ?? null } : null;
const outResolve = ({ catalogue, questions }) => ({ catalogue, cases: questions.map(q => ({ q, out: pick(F.resolveProgramme(q, catalogue)), loose: pick(F.resolveProgramme(q, catalogue, true)) })) });
const outTier = inp => inp.map(c => ({ ...c, out: (({ action, stage }) => ({ action, stage }))(F.decideTier({ gate: c.gate, ranked: c.scores.map((s, i) => ({ e: { id: `e${i}` }, s })) })) }));

// --- frozen inputs (only built in write mode) ---
function inputs() {
  const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
  const P = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')).programmes;
  const sec = (p, k) => (p.announcement && p.announcement.sections && p.announcement.sections[k]) || [];
  const catalogue = P.map(p => ({ code: p.code, title: p.title, title_en: p.title_en || '', level: p.level, faculty: p.faculty, kind: p.kind,
    announcement: p.announcement ? { status: p.announcement.status || '', title_en: p.announcement.title_en || '' } : null }));
  const faq = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items.map(i => i.th).filter(Boolean);
  const odd = JSON.parse(readFileSync(join(root, 'benchmark/odd/odd_questions.json'), 'utf8')).items.map(i => i.q);
  const progQs = P.slice(0, 120).flatMap(p => [`สมัคร${p.title}`, `ค่าเทอม${p.title}`, `${p.title}สอบสัมภาษณ์วันไหน`]);
  const gates = [0.3, 0.59, 0.6, 0.7, 0.79, 0.8, 0.9], scores = [[], [7], [6], [4], [3], [2], [6, 4], [5, 4], [4, 3], [3, 2], [2, 2], [4, 2], [6, 5]];
  return {
    answer_points: KB.map(e => ({ id: e.id, answer: e.answer })),
    schedule_fee: P.filter(p => p.announcement).map(p => ({ code: p.code, schedule_lines: sec(p, 'กำหนดการสอบคัดเลือก'), fee_lines: sec(p, 'ค่าธรรมเนียมการศึกษา') })),
    resolve: { catalogue, questions: [...new Set([...lines('benchmark/coverage/beginner_questions.txt'), ...faq, ...odd, ...progQs])] },
    decide_tier: gates.flatMap(gate => scores.map(s => ({ gate, scores: s }))),
  };
}
const OUT = { answer_points: outPoints, schedule_fee: outProg, resolve: outResolve, decide_tier: outTier };
let bad = 0;
if (CHECK) {
  for (const [name, fn] of Object.entries(OUT)) {
    const file = join(DIR, `${name}.json`);
    if (!existsSync(file)) { console.log(`✗ ${name}: missing ${file}`); bad++; continue; }
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const input = name === 'resolve' ? { catalogue: saved.catalogue, questions: saved.cases.map(c => c.q) }
      : saved.map(({ points, slot, schedule, fee, out, ...rest }) => rest);
    const now = fn(input), a = JSON.stringify(now), b = JSON.stringify(saved);
    const n = name === 'resolve' ? saved.cases.length : saved.length;
    if (a === b) console.log(`✓ ${name}: ${n} cases match`); else { bad++;
      const arrNow = name === 'resolve' ? now.cases : now, arrSaved = name === 'resolve' ? saved.cases : saved;
      const i = arrNow.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(arrSaved[k]));
      console.log(`✗ ${name}: differs at case ${i}: ${JSON.stringify(arrSaved[i]).slice(0, 160)}\n   now: ${JSON.stringify(arrNow[i]).slice(0, 160)}`); }
  }
  process.exit(bad ? 1 : 0);
}
const inp = inputs();
for (const [name, fn] of Object.entries(OUT)) {
  const data = fn(inp[name]);
  // one case per line: reviewable diffs, and a Rust test can stream it
  const body = name === 'resolve'
    ? `{"catalogue":[\n${data.catalogue.map(x => JSON.stringify(x)).join(',\n')}\n],"cases":[\n${data.cases.map(x => JSON.stringify(x)).join(',\n')}\n]}\n`
    : `[\n${data.map(x => JSON.stringify(x)).join(',\n')}\n]\n`;
  writeFileSync(join(DIR, `${name}.json`), body);
  console.log(`wrote benchmark/golden/${name}.json  ${name === 'resolve' ? data.cases.length : data.length} cases  ${(body.length / 1024).toFixed(0)} KB`);
}
