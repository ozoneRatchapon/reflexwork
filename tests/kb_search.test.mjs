// Recall eval for the neurosymbolic KB search in submissions/ui/chatbot.html.
// Run: node tests/kb_search.test.mjs   (exit 0 = pass, 1 = fail)
//
// search() is a HYBRID: TF-IDF cosine (modelless "latent", 0 token, deterministic)
// as the PRIMARY ranker + lexical char-n-gram overlap as a tiebreak. This 50-case
// labeled eval (exact / paraphrase / typo / English + off-corpus) pins the measured
// quality so a future edit can't silently regress it. We EXTRACT the real search()
// from the HTML so the test exercises production code, not a copy. Needs the
// generated knowledge-index.json (built locally / in CI).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const idxPath = join(root, 'submissions/ui/knowledge-index.json');
const htmlPath = join(root, 'submissions/ui/chatbot.html');

let pass = 0, fail = 0;
const ge = (name, got, floor) => { const ok = got >= floor; console.log((ok ? '✓' : '✗') + ` ${name} — ${got} (floor ${floor})`); ok ? pass++ : fail++; };
const le = (name, got, ceil) => { const ok = got <= ceil; console.log((ok ? '✓' : '✗') + ` ${name} — ${got} (ceil ${ceil})`); ok ? pass++ : fail++; };
const truthy = (name, v) => { const ok = !!v; console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };

if (!existsSync(idxPath)) {
  console.log('⚠ knowledge-index.json not present (gitignored) — run build_knowledge_index.py. Skipping recall eval.');
  process.exit(0);
}
const KB = JSON.parse(readFileSync(idxPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');
const m = html.match(/let _IDF=null[\s\S]*?\/\/ returns ranked list/);
truthy('search() block found in chatbot.html', m);
if (!m) { console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(1); }
const search = new Function('KB', m[0].replace(/\/\/ returns ranked list/, 'return scored; }') + '\n return search;')(KB);

// [query, expected_id | null(=off-corpus, must abstain), kind]
const C = [
  ['ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน', 'thesis_submit_days', 'exact'],
  ['ค่าสมัครสอบ MU GRAD Plus เท่าไร', 'mugrad_plus_fee', 'exact'],
  ['ส่ง Turnitin Originality Report อย่างไร', 'thesis_turnitin', 'exact'],
  ['ลาพักการศึกษาต้องทำอย่างไร', 'leave_of_absence', 'exact'],
  ['ขอเปลี่ยนชื่อ-สกุล ขณะกำลังศึกษา', 'change_name', 'exact'],
  ['มีสาขาวิชาอะไรเปิดรับสมัครบ้าง', 'admission_programs', 'exact'],
  ['ค่าสมัครสอบ TOEFL ITP เท่าไร', 'toefl_itp_fee', 'exact'],
  ['ดูผลคะแนน MU GRAD Plus ได้เมื่อไร', 'mugrad_result_days', 'exact'],
  ['ทุนการศึกษามีอะไรบ้าง', 'scholarship_types', 'exact'],
  ['คำนวณค่าปรับส่งเล่มล่าช้า', 'thesis_late_penalty', 'exact'],
  ['ส่งเล่มวิทยานิพนธ์ช้าสุดกี่วัน', 'thesis_submit_days', 'paraphrase'],
  ['ตรวจความซ้ำเกินเท่าไหร่ถึงไม่ผ่าน', 'thesis_turnitin', 'paraphrase'],
  ['อยากสมัครเรียนต่อต้องทำยังไง', 'admission_how', 'paraphrase'],
  ['เปิดรับสมัครช่วงไหน', 'admission_schedule', 'paraphrase'],
  ['หยุดเรียนชั่วคราวได้ไหม', 'leave_of_absence', 'paraphrase'],
  ['เปลี่ยนนามสกุลตอนเรียนอยู่', 'change_name', 'paraphrase'],
  ['อยากรู้ว่ามีทุนแบบไหนบ้าง', 'scholarship_types', 'paraphrase'],
  ['สอบ MU GRAD ราคาเท่าไหร่', 'mugrad_plus_fee', 'paraphrase'],
  ['ส่งไฟล์เล่มออนไลน์ต้องเตรียมอะไร', 'thesis_ethesis_files', 'paraphrase'],
  ['เรียนภาษาอังกฤษ GRID กี่ตัว', 'grid_count', 'paraphrase'],
  ['จองวิชา GRID ยังไง', 'grid_booking', 'paraphrase'],
  ['ขอเปลี่ยนหัวข้อธีสิส', 'thesis_change_topic', 'paraphrase'],
  ['ติดต่อบัณฑิตวิทยาลัยทางไหนได้บ้าง', 'contact_line', 'paraphrase'],
  ['ยื่นคะแนน IELTS ยังไง', 'english_submit_score', 'paraphrase'],
  ['เกรดไม่ถึงสมัครได้ไหม', 'admission_low_grade', 'paraphrase'],
  ['คาสอบเทาไหร่', 'mugrad_plus_fee', 'typo'],
  ['turnitin กีเปอเซน', 'thesis_turnitin', 'typo'],
  ['สมัคเรียนยังไง', 'admission_how', 'typo'],
  ['ลาพักการสึกษา', 'leave_of_absence', 'typo'],
  ['ทุนการสึกษามีอะไร', 'scholarship_types', 'typo'],
  ['เปิดรับสมัคเมื่อไร', 'admission_schedule', 'typo'],
  ['ส่งเล่มกีวัน', 'thesis_submit_days', 'typo'],
  ['คาปรับส่งเลมช้า', 'thesis_late_penalty', 'typo'],
  ['เปลียนหัวข้อวิทยานิพน', 'thesis_change_topic', 'typo'],
  ['จอง grid ระบบล่ม', 'grid_system_down', 'typo'],
  ['how much is the exam fee', 'mugrad_plus_fee', 'en'],
  ['thesis submission deadline days', 'thesis_submit_days', 'en'],
  ['how to apply for admission', 'admission_how', 'en'],
  ['what programs are open', 'admission_programs', 'en'],
  ['turnitin originality report', 'thesis_turnitin', 'en'],
  ['leave of absence how', 'leave_of_absence', 'en'],
  ['scholarship types available', 'scholarship_types', 'en'],
  ['toefl itp fee', 'toefl_itp_fee', 'en'],
  ['change my name while studying', 'change_name', 'en'],
  ['english score submit toefl ielts', 'english_submit_score', 'en'],
  ['grid english course how many', 'grid_count', 'en'],
  ['late submission penalty', 'thesis_late_penalty', 'en'],
  ['mu grad plus result when', 'mugrad_result_days', 'en'],
  ['contact graduate school', 'contact_line', 'en'],
  ['how to change thesis topic', 'thesis_change_topic', 'en'],
  ['วันนี้อากาศเป็นยังไง', null, 'offcorpus'],
  ['ร้านกาแฟใกล้ที่นี่อยู่ไหน', null, 'offcorpus'],
];
const ids = new Set(KB.map(e => e.id));
const known = C.filter(c => c[1] === null || ids.has(c[1]));
let h1 = 0, h3 = 0, fp = 0, nq = 0, offOK = 0, offN = 0;
for (const [q, exp] of known) {
  const r = search(q), top = r[0];
  if (exp === null) { offN++; if (!top || top.s < 4) offOK++; continue; }
  nq++;
  const in1 = top && top.e.id === exp, in3 = r.slice(0, 3).some(x => x.e.id === exp);
  if (in1) h1++; if (in3) h3++;
  if (top && top.e.id !== exp && top.s >= 4) fp++;
}
console.log(`eval: ${nq} labeled queries + ${offN} off-corpus`);
// Floors = measured on 2026-10-17 (recall@1 80% / @3 96% / FP 6% / off-corpus 2/2).
// A small margin below the measured values so KB edits don't flake the gate.
ge('recall@1', h1, Math.round(nq * 0.74));
ge('recall@3', h3, Math.round(nq * 0.90));
le('false-positive (wrong top clears gate)', fp, Math.ceil(nq * 0.12));
ge('off-corpus correctly abstained', offOK, offN);
// common-path regression + determinism
const ex = search('ส่งรูปเล่มภายในกี่วัน');
truthy('exact match ranks thesis-submit top', ex[0] && ex[0].e.id === 'thesis_submit_days');
const a = search('ค่าสอบเท่าไร')[0], b = search('ค่าสอบเท่าไร')[0];
truthy('deterministic (same query → same top)', a && b && a.e.id === b.e.id);

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
