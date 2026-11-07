// Experiment (read-only): an "answer-type match" signal (idea composed from katgpt-rs crates/katgpt-extract typed parsers):
// if the question asks for a value of a type (money / duration / date-time / count), does the candidate entry contain a value of that type?
// A near-miss often shares the topic but asks for a fact the entry does not state. Lexical only; Thai + English patterns written here.
// Measures, on the generated questions with the SOURCE entry as candidate: how often a paraphrase (entry answers it) vs a near-miss
// (entry does not) gets flagged "asks for type T, entry has no T". Run: node benchmark/synth/answer_type.mjs [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = new Map(JSON.parse(R('submissions/ui/knowledge-index.json')).map(e => [e.id, e]));
const items = JSON.parse(R('benchmark/synth/questions_001.json')).items.filter(x => x.q && KB.has(x.source_id));
const TH_MON = 'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.';
// what the question asks for
const ASK = {
  money: /กี่บาท|ราคา|ค่าใช้จ่าย|ค่าธรรมเนียม|ค่า\S{0,25}(?:เท่า|กี่)|how much|fee|cost|price/i,
  quant: /เท่าไร|เท่าไหร่|เท่าใด/i,
  duration: /กี่วัน|นานแค่ไหน|นานเท่าไ|ใช้เวลา|ระยะเวลา|กี่สัปดาห์|กี่เดือน|กี่ปี|how long|how many days|duration/i,
  when: /เมื่อไร|เมื่อไหร่|วันไหน|วันที่เท่าไ|ช่วงไหน|ถึงวันไหน|กำหนดการ|เปิดรับ.*เมื่อ|หมดเขต|deadline|\bwhen\b|what date/i,
  count: /กี่(?:คน|ครั้ง|หน่วยกิต|ฉบับ|ชุด|รายวิชา|เล่ม|ทุน)|how many/i,
};
// what the entry contains
const HAS = {
  quant: /\d/,
  money: /\d[\d,]*\s*(?:บาท|baht|thb)|฿\s*\d/i,
  duration: /\d+\s*(?:วัน|สัปดาห์|เดือน|ปี|ชั่วโมง|ชม\.|days?|weeks?|months?|years?|hours?)/i,
  when: new RegExp(`\\d{1,2}\\s*(?:${TH_MON})|(?:${TH_MON})\\s*\\d{2,4}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|ภายใน\\s*\\d+|ก่อน\\s*\\d+|\\d+\\s*วัน(?:ทำการ)?|ภาค(?:ต้น|ปลาย|ฤดูร้อน)|ปฏิทินการศึกษา|กำหนดการ`, 'i'),
  count: /\d+\s*(?:คน|ครั้ง|หน่วยกิต|ฉบับ|ชุด|รายวิชา|เล่ม|ทุน)|ไม่เกิน\s*\d+/i,
};
const asks = q => { const a = Object.keys(ASK).filter(k => ASK[k].test(q)); return a.length > 1 ? a.filter(k => k !== 'quant') : a; };
const flagged = (q, e) => { const a = asks(q); return a.length > 0 && a.every(k => !HAS[k].test(`${e.title}\n${e.answer}`)); };
const rows = {};
for (const kind of ['para_th', 'para_en', 'near_miss']) {
  const s = items.filter(x => x.kind === kind);
  const withType = s.filter(x => asks(x.q).length), f = s.filter(x => flagged(x.q, KB.get(x.source_id)));
  rows[kind] = { n: s.length, typed: withType.length, flagged: f.length, ex: f.slice(0, 3).map(x => x.q) };
}
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '-';
let md = `# Answer-type match signal (lexical, no model)\n\nCandidate entry = the question's source entry. "Flagged" = the question asks for a value type the entry text does not contain.\n\n`;
md += `| set | n | asks a typed value | flagged (type missing in entry) | examples flagged |\n|---|---|---|---|---|\n`;
for (const [k, r] of Object.entries(rows)) md += `| ${k} | ${r.n} | ${pct(r.typed, r.n)} | ${pct(r.flagged, r.n)} (${r.flagged}) | ${r.ex.map(x => x.slice(0, 45)).join(' · ')} |\n`;
const P = rows.para_th, N = rows.near_miss;
md += `\nRead: a useful abstain signal flags many near-misses and few paraphrases. Near-misses flagged ${pct(N.flagged, N.n)} vs Thai paraphrases ${pct(P.flagged, P.n)} `;
md += `(each paraphrase flagged would be a right answer lost if used as a hard rule). Unreviewed labels.\n`;
if (process.argv[2]) writeFileSync(process.argv[2], md); console.log(md);
