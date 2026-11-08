// What does the page REALLY do with a retrieval score? Measures the production decideTier() (the page's, Rust) and scoring variants.
//   node benchmark/compare/decision_rule.mjs
// For each rule, over the same questions:  in-corpus -> answered right / answered WRONG / asked which one / handed on;
//                                          off-corpus -> answered (always wrong) / refused (right).
// Rules: "now" = the code as shipped (acts from score 3 unless two entries are within 1 point);  "s>=4 only" = the stricter rule the docs described.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch, pageDecideTier, searchSource } from '../../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const evalSrc = readFileSync(join(root, 'tests/kb_search.test.mjs'), 'utf8');
// The variants are edits of the JS scorer (`_cosToScore` in the search block of the plan-015 snapshot; the page itself runs the Rust port).
const twinSrc = searchSource() + 'return _jsSearch;';
const LIFT6 = 'if(c>=0.15 && ov>=8 && ovLead>=4) return 6;', LIFT5 = 'if(c>=0.15 && ov>=5 && ovLead>=2) return 5;';   // the shipped rule since 2026-11-03
if (!twinSrc.includes(LIFT6) || !twinSrc.includes(LIFT5)) throw new Error('_cosToScore changed: update the variants in this script');
const mk = t => new Function('KB', t)(KB);
const SCORERS = {
  'shipped: overlap lifts only if cosine >= 0.15':       pageSearch(KB, html),
  'before 2026-11-03: overlap could lift any candidate': mk(twinSrc.replace(LIFT6, 'if(ov>=8 && ovLead>=4) return 6;').replace(LIFT5, 'if(ov>=5 && ovLead>=2) return 5;')),
  'cosine only (no overlap lift at all)':                mk(twinSrc.replace(LIFT6, '').replace(LIFT5, '')),
};
const decide = pageDecideTier(html);
const GATE = 0.061;
const CASES = [...evalSrc.matchAll(/^\s*\['([^']+)',\s*(null|'[^']*'),\s*'([^']*)'\],?$/gm)].map(m => ({ q: m[1], exp: m[2] === 'null' ? null : m[2].slice(1, -1), kind: m[3] }));
const ALT = new Function('return ' + evalSrc.match(/const ALT = (\{[\s\S]*?\n\});/)[1])();
const ids = new Set(KB.map(e => e.id));
const inCorpus = CASES.filter(c => c.exp && ids.has(c.exp)).map(c => ({ q: c.q, ok: new Set([c.exp, ...(ALT[c.q] || [])]), kind: c.kind }));
const MIXED = [['deadline ส่ง thesis กี่วัน', 'thesis_submit_days'], ['ค่าสมัครสอบ MU GRAD Plus how much', 'mugrad_plus_fee'], ['ขอ leave of absence ทำยังไง', 'leave_of_absence'], ['scholarship มีอะไรบ้าง', 'scholarship_types'],
  ['เปลี่ยน name ตอนเรียนอยู่', 'change_name'], ['สมัคร admission ต้องทำยังไง', 'admission_how'], ['TOEFL ITP fee เท่าไร', 'toefl_itp_fee'], ['ผล MU GRAD Plus ออกเมื่อไหร่ result', 'mugrad_result_days'],
  ['GRID course จองยังไง', 'grid_booking'], ['ยื่น IELTS score ทำไง', 'english_submit_score'], ['ค่าปรับ late submission คิดยังไง', 'thesis_late_penalty'], ['เปลี่ยน thesis topic ได้ไหม', 'thesis_change_topic']]
  .map(([q, id]) => ({ q, ok: new Set([id]), kind: 'mixed' }));
const OFF_EN = ['can I defer my enrollment', 'where is the library', 'what is the weather today', 'how do I get a student visa for Thailand', 'can I work part time while studying', 'recommend a restaurant near campus', 'what is the capital of France', 'how long does a PhD take', 'who is the dean of the graduate school', 'is there a gym on campus', 'do you offer online degrees', 'what is the acceptance rate', 'how do I get a parking permit', 'what GPA do I need for honors', 'can my spouse live with me in student housing', 'tell me a joke'];
const OFF_TH = ['ขอเลื่อนการเข้าศึกษาได้ไหม', 'ห้องสมุดอยู่ที่ไหน', 'วันนี้อากาศเป็นยังไง', 'ขอวีซ่านักศึกษาต่างชาติยังไง', 'ทำงานพิเศษระหว่างเรียนได้ไหม', 'แนะนำร้านอาหารใกล้มหาลัยหน่อย', 'เมืองหลวงของฝรั่งเศสคืออะไร', 'เรียนเอกกี่ปี', 'คณบดีบัณฑิตวิทยาลัยคือใคร', 'มีฟิตเนสในมหาลัยไหม', 'มีหลักสูตรออนไลน์ไหม', 'อัตราการรับเข้าเท่าไหร่', 'ขอบัตรจอดรถยังไง', 'เกรดเท่าไหร่ถึงได้เกียรตินิยม', 'คู่สมรสพักหอนักศึกษาด้วยได้ไหม', 'เล่าเรื่องตลกหน่อย', ...CASES.filter(c => c.exp === null).map(c => c.q)];
const pct = (k, n) => `${k}/${n}`.padEnd(6) + `(${String(Math.round(100 * k / n)).padStart(3)}%)`;
function inc(srch, set) { let right = 0, wrong = 0, ask = 0, hand = 0; for (const c of set) { const v = decide({ gate: GATE, ranked: srch(c.q) }); if (v.action === 'act') (c.ok.has(v.entry.id) ? right++ : wrong++); else if (v.action === 'disambiguate') ask++; else hand++; } return { right, wrong, ask, hand, n: set.length }; }
function off(srch, set) { let answered = 0; for (const q of set) if (decide({ gate: GATE, ranked: srch(q) }).action === 'act') answered++; return { answered, n: set.length }; }
const en = inCorpus.filter(c => c.kind === 'en'), thai = inCorpus.filter(c => c.kind !== 'en');
const f = r => `${r.right} / ${r.wrong} / ${r.ask} / ${r.hand}`;
console.log(`Shipped decision rule (decideTier), three ways of scoring. In-corpus cells: right / WRONG / asked which / handed on.\n`);
console.log(`| scoring | Thai in-corpus (${thai.length}) | English in-corpus (${en.length}) | mixed (${MIXED.length}) | off-corpus English (${OFF_EN.length}): answered anyway | off-corpus Thai (${OFF_TH.length}): answered anyway |\n|---|---|---|---|---|---|`);
for (const [name, srch] of Object.entries(SCORERS)) console.log(`| ${name} | ${f(inc(srch, thai))} | ${f(inc(srch, en))} | ${f(inc(srch, MIXED))} | ${pct(off(srch, OFF_EN).answered, OFF_EN.length)} | ${pct(off(srch, OFF_TH).answered, OFF_TH.length)} |`);
