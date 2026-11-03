#!/usr/bin/env node
// Golden contract for the Rust port (.plans/002_rust-core-migration.md, step 0).
// Freezes INPUTS together with the CURRENT JS OUTPUTS of the pure answer logic in chatbot.html, so a Rust implementation must
// reproduce them exactly before the page switches to it. Inputs are frozen in the files too, so the weekly catalogue refresh and
// KB rebuilds do not break the contract.
//   node scripts/golden_dump.mjs            write benchmark/golden/*.json from the current data + JS
//   node scripts/golden_dump.mjs --check    re-run the JS on the FROZEN inputs and fail on any difference (used by the test)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadChatbotFns, loadSearch, loadUnderstand, root } from './lib/chatbot_fns.mjs';
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

// understand(): the search results of each phrase are FROZEN in the case (top 3: id + score), so the contract does not depend on the KB.
const outUnderstand = inp => inp.map(c => {
  const stub = p => { const i = c.phrases.indexOf(p); return (c.results[i] || []).map(h => ({ e: { id: h.id }, s: h.s })); };
  const r = loadUnderstand(stub)(c.phrases);
  const out = r.kind === 'one' ? { kind: 'one', id: r.entry.id, score: r.score, via: r.via, others: r.others.map(e => e.id) } : r.kind === 'many' ? { kind: 'many', ids: r.entries.map(e => e.id) } : { kind: 'none' };
  return { ...c, out };
});

function understandInputs(KB) {
  const search = loadSearch(KB), titles = KB.map(e => e.title), frag = (t, n = 12) => t.slice(0, n).trim();
  const lists = [
    ['ลาพักการศึกษา', 'ขั้นตอนการขอลาพักการศึกษา'], ['ตรวจการคัดลอกวิทยานิพนธ์', 'การตรวจสอบการซ้ำ', 'แก้ไขวิทยานิพนธ์'], ['ทุนการศึกษา', 'เงินสนับสนุนการศึกษา'],
    ['ลาพักการศึกษา'], ['เปลี่ยนนามสกุล'], ['ขอใบแสดงผลการศึกษา', 'หนังสือรับรองผลการศึกษา'], [], ['x'], ['qqqq zzzz', 'xxxx'], ['ทุน'], ['ทุน', 'ทุนการศึกษา', 'ทุนวิทยานิพนธ์'],
  ];
  KB.forEach((e, i) => { const o = titles[(i * 7 + 3) % titles.length], o2 = titles[(i * 11 + 5) % titles.length];
    lists.push([e.title], [frag(e.title)], [frag(e.title, 8)], [e.title, e.title], [e.title, frag(e.title)], [e.title, o], [frag(e.title), frag(o)], [e.title, o, o2], [frag(e.title, 20), frag(e.title, 6), frag(o2)], [o2, o2, e.title]); });
  return lists.map(phrases => ({ phrases, results: phrases.map(p => search(p).slice(0, 3).map(r => ({ id: r.e.id, s: r.s }))) }));
}

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
  // Edge families added 2026-11-03 after mutation tests showed the Rust port's lookahead, level, intl/special, code, alias, broad-cap and
  // loose-window rules were not exercised. The JS functions produce the expected outputs; the questions are frozen in the file.
  const nameOf = t => (t.indexOf('สาขาวิชา') >= 0 ? t.slice(t.indexOf('สาขาวิชา') + 8) : t).replace(/\([^)]*\)/g, '').trim();
  const sample = P.filter((_, i) => i % 3 === 0), names = sample.map(p => nameOf(p.title)).filter(n => n.length >= 6);
  const lookahead = ['มีหลักสูตรพยาบาล', 'มีสาขาเภสัช', 'มีหลักสูตรอะไรบ้าง', 'ต่อโทจิตวิทยาคลินิก', 'ต่อเอกสาธารณสุข', 'ที่ จิตวิทยาคลินิก', 'สนใจที่   จิตวิทยาคลินิก', 'ที่\tชีวสถิติ'];
  const levels = names.slice(0, 60).flatMap(n => [`ปริญญาโท ${n}`, `ปริญญาเอก ${n}`, `ป.โท ${n}`, `ประกาศนียบัตร ${n}`, `${n} master`, `${n} ph.d`, `ป.บ.ช.สูง ${n}`]);
  const kinds = names.slice(0, 60).flatMap(n => [`${n} นานาชาติ`, `${n} ภาคพิเศษ`, `${n} international program`, `special programme ${n}`, `ปริญญาโท ${n} ภาคพิเศษ`]);
  const asks = names.slice(0, 60).flatMap(n => [`ทุน${n}`, `${n}คุณสมบัติ`, `${n} toefl`, `${n}เปิดรับไหม`, `${n}ประกาศผลวันไหน`, `${n}รายงานตัว`, `${n}เอกสารสมัคร`]);
  const codes = P.slice(0, 40).flatMap(p => [p.code, `สมัคร ${p.code}`, p.code.toLowerCase(), `ค่าเทอม ${p.code}`]).concat(['9999M99G', 'สมัคร 0000D00S']);
  const aliases = ['mph', 'สมัคร MPH', 'itm ค่าเทอม', 'MPH international', 'ITM', 'ปริญญาโท mph', 'xmphx', 'อยากเรียน itm ภาคพิเศษ'];
  const typos = names.slice(0, 130).flatMap(n => [n.slice(0, 3) + n.slice(4), n.slice(0, 2) + n[3] + n[2] + n.slice(4), n.slice(0, 3) + n[2] + n.slice(3)]);
  const words = [...new Set(P.flatMap(p => { const n = nameOf(p.title); return [5, 6, 8].map(k => n.slice(0, k)); }).filter(w => w.length >= 5))].sort();
  const pool = words.map(w => `หลักสูตร${w}`).map(q => ({ q, r: F.resolveProgramme(q, catalogue) })).filter(x => x.r);
  const near = pool.filter(x => { const t = x.r.total ?? 1; return t >= 10 && t <= 14; }).map(x => x.q).slice(0, 80);
  const consumed = names.slice(0, 60).flatMap(n => [`มีสาขาวิชา${n}`, `มีหลักสูตร${n}`, `มีสาขา${n}`, `สนใจมีสาขาวิชา${n}`]);                  // "มี" + lookahead word
  const feeNear = near.slice(0, 50).flatMap(q => [q.replace('หลักสูตร', 'ค่าเทอม'), q.replace('หลักสูตร', 'ทุน')]);                   // topic + a pool of ~12
  const justName = names.slice(0, 60).flatMap(n => [n, `${n}xy`, `${n}xyz`, `${n}wxyz`, `${n} ครับ`]);                                // no intent word: "is it just a name?"
  const short = ['เคมี', 'สมัครเคมี', 'สมัครชีวเคมี', 'เรียนฟิสิกส์', 'สมัครแพทย์', 'ยา', 'สมัครยา', 'จิตเวช', 'สมัครจิตเวช', 'สมัครสถิติ', 'ไวรัส', 'สนใจไวรัส'];
  const spaces = ['\u00a0', '\u3000', '\ufeff', '\u200b', '\u2003', '\u0085', '\u200d', ' '].flatMap(w => [`สมัคร${w}ชีวสถิติ`, `${w}สมัครชีวสถิติ${w}`, `สมัคร${w}${w}จิตวิทยาคลินิก`]);
  const edges = [...lookahead, ...levels, ...kinds, ...asks, ...codes, ...aliases, ...typos, ...near, ...consumed, ...feeNear, ...justName, ...short, ...spaces];
  const gates = [0.3, 0.59, 0.6, 0.7, 0.79, 0.8, 0.9], scores = [[], [7], [6], [4], [3], [2], [6, 4], [5, 4], [4, 3], [3, 2], [2, 2], [4, 2], [6, 5]];
  return {
    answer_points: KB.map(e => ({ id: e.id, answer: e.answer })),
    schedule_fee: P.filter(p => p.announcement).map(p => ({ code: p.code, schedule_lines: sec(p, 'กำหนดการสอบคัดเลือก'), fee_lines: sec(p, 'ค่าธรรมเนียมการศึกษา') })),
    resolve: { catalogue, questions: [...new Set([...lines('benchmark/coverage/beginner_questions.txt'), ...faq, ...odd, ...progQs, ...edges])] },
    decide_tier: gates.flatMap(gate => scores.map(s => ({ gate, scores: s }))),
    understand: understandInputs(KB),
  };
}
const OUT = { answer_points: outPoints, schedule_fee: outProg, resolve: outResolve, decide_tier: outTier, understand: outUnderstand };
let bad = 0;
if (CHECK) {
  for (const [name, fn] of Object.entries(OUT)) {
    const file = join(DIR, `${name}.json`);
    if (!existsSync(file)) { console.log(`✗ ${name}: missing ${file}`); bad++; continue; }
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const input = name === 'resolve' ? { catalogue: saved.catalogue, questions: saved.cases.map(c => c.q) }
      : saved.map(({ points, slot, schedule, fee, out, ...rest }) => rest);   // understand: phrases + frozen results stay
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
