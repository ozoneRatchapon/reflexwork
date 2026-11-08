// Experiment (read-only, local model only): would a meaning-based signal (embeddings) find the right entry where the lexical search fails?
// Compares, on the same questions: (1) the shipped lexical search, (2) embeddings alone, (3) a hybrid = lexical first, embeddings only
// to re-rank the lexical top 10 or when the lexical top score is weak. Embeddings via Ollama /api/embed (nothing leaves the machine).
// NOTE: using (2)/(3) in the chat would need a model per question at run time - a change of direction, not decided.
// Run: node benchmark/synth/embed.mjs [questions.json] [out.md] [--model nomic-embed-text]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch } from '../../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const argv = process.argv.slice(2), pos = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const qPath = pos[0] || join(root, 'benchmark/synth/questions_001.json'), outPath = pos[1];
const MODEL = (argv.includes('--model') && argv[argv.indexOf('--model') + 1]) || 'nomic-embed-text';
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const search = pageSearch(KB, html);
const cachePath = `/tmp/rw_embed_${MODEL.replace(/\W/g, '_')}.json`, cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const key = t => createHash('sha256').update(t).digest('hex').slice(0, 20);
async function embed(texts) {
  const miss = [...new Set(texts.filter(t => !cache[key(t)]))];
  for (let i = 0; i < miss.length; i += 32) {
    const r = await fetch('http://127.0.0.1:11434/api/embed', { method: 'POST', body: JSON.stringify({ model: MODEL, input: miss.slice(i, i + 32) }) });
    if (!r.ok) throw new Error(`ollama ${r.status} ${await r.text()}`);
    (await r.json()).embeddings.forEach((v, j) => { cache[key(miss[i + j])] = v; });
  }
  writeFileSync(cachePath, JSON.stringify(cache));
  return texts.map(t => cache[key(t)]);
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const docText = e => `${e.title}\n${String(e.answer).slice(0, 400)}`;
const DV = await embed(KB.map(docText));

const items = JSON.parse(readFileSync(qPath, 'utf8')).items.filter(x => x.q && x.kind !== 'near_miss');
const nearItems = JSON.parse(readFileSync(qPath, 'utf8')).items.filter(x => x.q && x.kind === 'near_miss');
const evalSrc = R('tests/kb_search.test.mjs');
const E52 = [...evalSrc.matchAll(/^\s*\['([^']+)',\s*'([^']+)',\s*'[^']*'\],?$/gm)].map(m => ({ q: m[1], gold: [m[2]], kind: 'eval52' }));
const FAQ = JSON.parse(R('benchmark/field/faq_questions.json')).items.filter(x => x.student && x.gold_kb_ids.length).map(x => ({ q: x.th, gold: x.gold_kb_ids, kind: 'faq_th' }));
const all = [...items, ...E52, ...FAQ, ...nearItems.map(x => ({ ...x, gold: [] }))];
const QV = await embed(all.map(x => x.q));
const WEAK = 4;   // decideTier's lowest "act" score band: below it the lexical search is not trusted
const rows = all.map((x, i) => {
  const lex = search(x.q), lexTop = lex[0] ? lex[0].e.id : null, lexS = lex[0] ? lex[0].s : 0;
  const sims = KB.map((e, j) => [e.id, cos(QV[i], DV[j])]).sort((a, b) => b[1] - a[1]);
  const embTop = sims[0][0];
  const top10 = new Set(lex.slice(0, 10).map(r => r.e.id));
  const rerank = sims.find(([id]) => top10.has(id));
  const hybrid = lexS >= WEAK ? lexTop : (rerank ? rerank[0] : embTop);
  // reciprocal rank fusion of the two rankings (k = 60, the usual constant)
  const rr = new Map(); lex.forEach((r, j) => rr.set(r.e.id, (rr.get(r.e.id) || 0) + 1 / (60 + j))); sims.forEach(([id], j) => rr.set(id, (rr.get(id) || 0) + 1 / (60 + j)));
  const rrf = [...rr].sort((a, b) => b[1] - a[1])[0][0];
  return { kind: x.kind, source_id: x.source_id, gold: x.gold, lexTop, lexS, embTop, embSim: sims[0][1], selfSim: x.source_id ? (sims.find(([id]) => id === x.source_id) || [0, 0])[1] : 0, hybrid, rrf, rerank10: rerank ? rerank[0] : lexTop };
});
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}% (${a}/${b})` : '-';
let md = `# Embedding experiment (${MODEL}, local)\n\nQuestions: \`${qPath.replace(root + '/', '')}\` (unreviewed model labels) + the 52-query eval + official FAQ th. "1st right" = the top entry is the gold one.\n\n`;
md += `| set | lexical (shipped) | embeddings alone | lexical top 10 re-ranked by embeddings | hybrid: lexical if score >= ${WEAK}, else embeddings | rank fusion (RRF) |\n|---|---|---|---|---|---|\n`;
for (const k of ['para_th', 'para_en', 'eval52', 'faq_th']) { const s = rows.filter(r => r.kind === k); if (!s.length) continue;
  const c = f => s.filter(r => r.gold.includes(r[f])).length;
  md += `| ${k} | ${pct(c('lexTop'), s.length)} | ${pct(c('embTop'), s.length)} | ${pct(c('rerank10'), s.length)} | ${pct(c('hybrid'), s.length)} | ${pct(c('rrf'), s.length)} |\n`; }
// should-answer vs should-not: a paraphrase (its entry answers it) vs a near-miss (the SAME entry does not). Signal = similarity to that entry.
const auroc = (pos, neg) => { let w = 0; for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0; return pos.length && neg.length ? w / (pos.length * neg.length) : NaN; };
const P = rows.filter(r => r.kind === 'para_th'), N = rows.filter(r => r.kind === 'near_miss');
md += `\n**Answer or not (Thai paraphrase vs near-miss of the same entry, ${P.length} vs ${N.length}):** AUROC of the embedding similarity to that entry = ${auroc(P.map(r => r.selfSim), N.map(r => r.selfSim)).toFixed(3)} `;
md += `(0.5 = no separation, 1 = perfect). Top-1 similarity, any entry: ${auroc(P.map(r => r.embSim), N.map(r => r.embSim)).toFixed(3)}; lexical top score: ${auroc(P.map(r => r.lexS), N.map(r => r.lexS)).toFixed(3)}.\n`;
md += `\nOnly "1st right" is measured here; whether the chat should ANSWER (abstain on near-misses) is not, and a run-time model per question is a direction change.\n`;
if (outPath) writeFileSync(outPath, md); console.log(md);
