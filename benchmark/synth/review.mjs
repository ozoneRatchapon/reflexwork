// Write a spot-check sheet for the generated questions: a fixed random sample (seeded), stratified by kind. A person fills the first column:
//   ok            the label is right (paraphrase: this entry answers it; near_miss: this entry does NOT answer it)
//   bad           the question is wrong / unnatural / mislabelled -> dropped by eval.mjs
//   other:<id>    another manual entry answers it (use the id from submissions/ui/knowledge-index.json)
// Run: node benchmark/synth/review.mjs [questions.json] [review.tsv] [per kind=20]   (never overwrites a sheet that has verdicts)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [qPath = join(root, 'benchmark/synth/questions_001.json'), out = join(root, 'benchmark/synth/review_001.tsv'), perKind = '20'] = process.argv.slice(2);
if (existsSync(out) && readFileSync(out, 'utf8').split('\n').slice(1).some(l => l.split('\t')[0].trim())) { console.log(`${out} already has verdicts - not overwritten`); process.exit(0); }
const KB = new Map(JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')).map(e => [e.id, e]));
const items = JSON.parse(readFileSync(qPath, 'utf8')).items.filter(x => x.q && KB.has(x.source_id));
let s = 20261107; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;   // seeded: the same sample every run
const rows = [];
for (const k of ['para_th', 'para_en', 'near_miss']) { const pool = items.filter(x => x.kind === k).map(x => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(perKind)).map(x => x[1]); rows.push(...pool); }
const clip = t => String(t).replace(/\s+/g, ' ').replace(/\t/g, ' ').slice(0, 160);
const tsv = ['verdict\tkind\tsource_id\tquestion\tentry title\tentry answer (start)', ...rows.map(x => { const e = KB.get(x.source_id); return ['', x.kind, x.source_id, x.q, clip(e.title), clip(e.answer)].join('\t'); })].join('\n') + '\n';
writeFileSync(out, tsv); console.log(`${rows.length} rows -> ${out}`);
