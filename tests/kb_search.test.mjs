// Recall-floor test for the neurosymbolic KB search in submissions/ui/chatbot.html.
// Run: node tests/kb_search.test.mjs   (exit 0 = pass, 1 = fail)
//
// The chatbot's search() is a HYBRID: TF-IDF cosine (modelless "latent", 0 token,
// deterministic) as the PRIMARY ranker + lexical char-n-gram overlap as a tiebreak.
// This pins the measured recall so a future edit can't silently regress it below
// the lexical-only baseline (recall@1 5/11, @3 8/11 on these labeled cases). We
// EXTRACT the real search() out of the HTML so the test exercises production code,
// not a copy. Needs the generated knowledge-index.json (built locally / in CI).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const idxPath = join(root, 'submissions/ui/knowledge-index.json');
const htmlPath = join(root, 'submissions/ui/chatbot.html');

let pass = 0, fail = 0;
const ge = (name, got, floor) => {
  const ok = got >= floor;
  console.log((ok ? '✓' : '✗') + ' ' + name + ` — ${got} (floor ${floor})`);
  ok ? pass++ : fail++;
};
const truthy = (name, v) => { const ok = !!v; console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };

if (!existsSync(idxPath)) {
  console.log('⚠ knowledge-index.json not present (gitignored) — run build_knowledge_index.py. Skipping recall test.');
  process.exit(0);
}
const KB = JSON.parse(readFileSync(idxPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');
const m = html.match(/let _IDF=null[\s\S]*?\/\/ returns ranked list/);
truthy('search() block found in chatbot.html', m);
if (!m) { console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(1); }
const search = new Function('KB', m[0].replace(/\/\/ returns ranked list/, 'return scored; }') + '\n return search;')(KB);

// Labeled cases — real KB ids, verified to exist.
const cases = [
  ['ส่งเล่มวิทยานิพนธ์ช้าสุดกี่วัน', 'thesis_submit_days', 'paraphrase'],
  ['ตรวจความซ้ำเกินเท่าไหร่ถึงไม่ผ่าน', 'thesis_turnitin', 'paraphrase'],
  ['อยากสมัครเรียนต่อต้องทำยังไง', 'admission_how', 'paraphrase'],
  ['เปิดรับสมัครช่วงไหน', 'admission_schedule', 'paraphrase'],
  ['คาสอบเทาไหร่', 'mugrad_plus_fee', 'typo'],
  ['turnitin กีเปอเซน', 'thesis_turnitin', 'typo'],
  ['สมัคเรียนยังไง', 'admission_how', 'typo'],
  ['how much is the exam fee', 'mugrad_plus_fee', 'en'],
  ['thesis submission deadline days', 'thesis_submit_days', 'en'],
  ['how to apply for admission', 'admission_how', 'en'],
  ['what programs are open', 'admission_programs', 'en'],
];
const ids = new Set(KB.map(e => e.id));
const known = cases.filter(c => ids.has(c[1]));
let h1 = 0, h3 = 0;
for (const [q, exp] of known) {
  const r = search(q);
  if (r[0] && r[0].e.id === exp) h1++;
  if (r.slice(0, 3).some(x => x.e.id === exp)) h3++;
}
// floors = the measured lexical-only baseline; the hybrid must never do worse.
ge('recall@1 ≥ lexical baseline', h1, 5);
ge('recall@3 ≥ lexical baseline', h3, 8);

// exact-match on the common path stays strong (humanize tier) + deterministic.
const ex = search('ส่งรูปเล่มภายในกี่วัน');
truthy('exact match ranks the thesis-submit entry top', ex[0] && ex[0].e.id === 'thesis_submit_days');
ge('exact match clears the strong (humanize) gate', ex[0] ? ex[0].s : 0, 5);
const a = search('ค่าสอบเท่าไร')[0], b = search('ค่าสอบเท่าไร')[0];
truthy('deterministic (same query → same top)', a && b && a.e.id === b.e.id);

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
