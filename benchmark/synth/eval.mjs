// Score the chat's search + decision on the offline labelled questions (generate.mjs). Read-only. Uses the page's own JS twin of the search
// and decideTier (identical to the Rust engine: tests/wasm_lockstep.test.mjs), exactly as benchmark/abstain/experiment.mjs does.
// Run: node benchmark/synth/eval.mjs [questions.json] [review.tsv] [out.md]
// review.tsv (review.mjs, filled in by a person): verdict per sampled question - ok | bad (label wrong) | other:<id> (another entry answers it).
// With a review, the sample's error rate is reported next to every number, so a reader knows how much label noise to expect.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const [qPath = join(root, 'benchmark/synth/questions_001.json'), rPath = join(root, 'benchmark/synth/review_001.tsv'), outPath] = process.argv.slice(2);
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const { jsSearch: search } = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn {jsSearch:_jsSearch, gramSet:_jsGramSet};'))(KB);
const decide = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const doc = JSON.parse(readFileSync(qPath, 'utf8'));
const ids = new Set(KB.map(e => e.id));
let items = doc.items.filter(x => x.q && x.kind !== 'empty' && ids.has(x.source_id));

// review: drop questions a person marked bad; re-label "other:<id>" (another entry answers it)
const review = new Map();
if (existsSync(rPath)) for (const line of readFileSync(rPath, 'utf8').split('\n').slice(1)) {
  const [verdict, kind, source_id, q] = line.split('\t'); if (q && verdict && verdict.trim()) review.set(q.trim(), verdict.trim());
}
const reviewed = [...review.values()], nRev = reviewed.length;
items = items.filter(x => review.get(x.q) !== 'bad').map(x => { const v = review.get(x.q) || ''; return v.startsWith('other:') ? { ...x, gold: [v.slice(6)], kind: x.kind === 'near_miss' ? 'near_miss_other' : x.kind } : x; });

// duplicate topics (.plans/001 Appendix A, read by hand): the same question is answered by either entry. Y = equivalent, P = partial.
const EQ_Y = [['gm_thesis_submission_10_deadline', 'thesis_submit_days'], ['gm_application_overview', 'admission_how'], ['gm_application_fee', 'admission_fee']];
const EQ_P = [['gm_thesis_submission_12_upload_documents', 'thesis_turnitin'], ['gm_thesis_submission_09_pdf_file', 'thesis_ethesis_files'], ['gm_thesis_submission_14_signoff', 'thesis_signature'],
  ['gm_thesis_submission_04_references', 'thesis_citation'], ['gm_admissions_office_contacts', 'contact_line'], ['gm_english_requirements_sources', 'admission_english']];
const widen = (gold, pairs) => [...new Set(gold.flatMap(g => [g, ...pairs.filter(p => p.includes(g)).flat()]))];
for (const it of items) { const r = search(it.q); it.top = r[0] ? r[0].e.id : null; it.top3 = r.slice(0, 3).map(x => x.e.id); it.action = decide({ gate: 0.061, ranked: r }).action; }
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}% (${a}/${b})` : '-';
const kinds = ['para_th', 'para_en', 'near_miss', 'near_miss_other'];
let md = `# Offline labelled questions: search + decision (${items.length} questions)\n\n`;
md += `Questions: \`${qPath.replace(root + '/', '')}\` written by a local model (${doc.model}, ${doc.created}). Engine: the page's JS twin of the search and decideTier (= Rust).\n`;
md += nRev ? `Human review: ${nRev} sampled questions, ${reviewed.filter(v => v === 'ok').length} ok, ${reviewed.filter(v => v === 'bad').length} bad label (dropped), ${reviewed.filter(v => v.startsWith('other:')).length} answered by another entry (re-labelled).\n\n`
  : `**No human review yet** - the labels are the model's; read every number as an estimate with unknown label noise (run review.mjs, fill the sheet).\n\n`;
md += `| set | n | right entry 1st | 1st, duplicates count (Y / Y+partial) | in top 3 | answered (act) | answered with a WRONG entry |\n|---|---|---|---|---|---|---|\n`;
for (const k of kinds) { const s = items.filter(x => x.kind === k); if (!s.length) continue;
  const neg = k === 'near_miss';
  const rY = s.filter(x => widen(x.gold, EQ_Y).includes(x.top)).length, rP = s.filter(x => widen(x.gold, [...EQ_Y, ...EQ_P]).includes(x.top)).length;
  const r1 = s.filter(x => x.gold.includes(x.top)).length, r3 = s.filter(x => x.top3.some(t => x.gold.includes(t))).length, act = s.filter(x => x.action === 'act').length;
  const wrongAct = neg ? s.filter(x => x.action === 'act' && x.top === x.source_id).length : s.filter(x => x.action === 'act' && !x.gold.includes(x.top)).length;
  md += `| ${k} | ${s.length} | ${neg ? '-' : pct(r1, s.length)} | ${neg ? '-' : `${pct(rY, s.length)} / ${pct(rP, s.length)}`} | ${neg ? '-' : pct(r3, s.length)} | ${pct(act, s.length)} | ${neg ? pct(wrongAct, s.length) + ' (with the very entry that does not answer it)' : pct(wrongAct, s.length)} |\n`; }
md += `\nReading: for near_miss, "answered" counts every act; a near-miss may still be answered correctly by ANOTHER entry until a review says otherwise, `;
md += `so "answered with the very entry that does not answer it" is the solid lower bound of wrong answers.\n`;
// per-entry weak spots: entries whose own paraphrases are found 1st least often
const per = new Map(); for (const x of items.filter(x => x.kind === 'para_th')) { const p = per.get(x.source_id) || [0, 0]; p[1]++; if (x.top === x.source_id) p[0]++; per.set(x.source_id, p); }
const weak = [...per].filter(([, [a, b]]) => b >= 3 && a / b <= 0.25).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
md += `\n**Entries whose Thai paraphrases are found first in at most 1 of 4 (${weak.length}):** ${weak.map(([id, [a, b]]) => `\`${id}\` ${a}/${b}`).join(', ') || 'none'}.\n`;
md += `These are candidates for better titles / keywords, not proof: check the paraphrases first.\n`;
if (outPath) writeFileSync(outPath, md); console.log(md);
