// Experiment (read-only): distil the bge-m3 embedding into a model-free map from char trigrams, offline (idea from katgpt-rs
// crates/katgpt-canon/src/source_adapter.rs: ridge-fit linear map from cheap deterministic features into a model latent).
// At run time the query vector would be  q = x(question) · W  - a sparse sum over the question's trigrams, no model.
// Fit: kernel ridge with the linear kernel on binary L2-normalised trigram sets (= ridge regression, Woodbury form), targets:
//   B: the bge-m3 vector of the item (entry text or question)  -> cosine against bge-m3 entry vectors
//   C: the entry one-hot (a linear classifier)                   -> argmax
// Train: entry texts + Thai paraphrases 0, 2 + English paraphrase 0 of each entry. Test: Thai 1, 3 / English 1 / eval52 / official FAQ th.
// Needs the bge-m3 cache written by embed.mjs (/tmp/rw_embed_bge_m3.json). Run: node benchmark/synth/distill.mjs [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch, loadGramSet } from '../../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const outPath = process.argv[2];
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const search = pageSearch(KB, html), gramSet = loadGramSet();   // search: the page's (Rust); gramSet: the JS trigram set of the plan-015 snapshot (feature only)
const cache = JSON.parse(readFileSync('/tmp/rw_embed_bge_m3.json', 'utf8')), key = t => createHash('sha256').update(t).digest('hex').slice(0, 20);
const emb = t => { const v = cache[key(t)]; if (!v) throw new Error('not in bge-m3 cache (run embed.mjs --model bge-m3): ' + t.slice(0, 40)); return v; };
const docText = e => `${e.title}\n${String(e.answer).slice(0, 400)}`;
const idx = new Map(KB.map((e, i) => [e.id, i]));
const items = JSON.parse(R('benchmark/synth/questions_001.json')).items.filter(x => x.q && idx.has(x.source_id));
const byE = (kind) => { const m = new Map(); for (const x of items.filter(x => x.kind === kind)) { const a = m.get(x.source_id) || []; a.push(x); m.set(x.source_id, a); } return m; };
const TH = byE('para_th'), EN = byE('para_en');
const train = [...KB.map(e => ({ text: docText(e), y: e.id, embText: docText(e) })),
  ...[...TH.values()].flatMap(a => a.filter((_, i) => i % 2 === 0)).map(x => ({ text: x.q, y: x.source_id, embText: x.q })),
  ...[...EN.values()].flatMap(a => a.slice(0, 1)).map(x => ({ text: x.q, y: x.source_id, embText: x.q }))];
const evalSrc = R('tests/kb_search.test.mjs');
const tests = {
  th_heldout: [...TH.values()].flatMap(a => a.filter((_, i) => i % 2 === 1)).map(x => ({ q: x.q, gold: [x.source_id] })),
  en_heldout: [...EN.values()].flatMap(a => a.slice(1)).map(x => ({ q: x.q, gold: [x.source_id] })),
  eval52: [...evalSrc.matchAll(/^\s*\['([^']+)',\s*'([^']+)',\s*'[^']*'\],?$/gm)].map(m => ({ q: m[1], gold: [m[2]] })),
  faq_th: JSON.parse(R('benchmark/field/faq_questions.json')).items.filter(x => x.student && x.gold_kb_ids.length).map(x => ({ q: x.th, gold: x.gold_kb_ids })),
};
// binary trigram set, L2-normalised -> sparse dot = |A∩B| / sqrt(|A||B|)
const feat = t => gramSet(String(t).toLowerCase());
const dot = (a, b) => { if (a.size > b.size) [a, b] = [b, a]; let n = 0; for (const g of a) if (b.has(g)) n++; return a.size && b.size ? n / Math.sqrt(a.size * b.size) : 0; };
const X = train.map(r => feat(r.text)), n = X.length;
function choleskySolve(A, B) {   // A n×n SPD (Float64Array rows), B n×m -> A^-1 B, in place on copies
  const L = A.map(r => Float64Array.from(r));
  for (let j = 0; j < n; j++) { let s = L[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k]; const d = Math.sqrt(s); L[j][j] = d;
    for (let i = j + 1; i < n; i++) { let t = L[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / d; } }
  const m = B[0].length, Z = B.map(r => Float64Array.from(r));
  for (let c = 0; c < m; c++) { for (let i = 0; i < n; i++) { let t = Z[i][c]; for (let k = 0; k < i; k++) t -= L[i][k] * Z[k][c]; Z[i][c] = t / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let t = Z[i][c]; for (let k = i + 1; k < n; k++) t -= L[k][i] * Z[k][c]; Z[i][c] = t / L[i][i]; } }
  return Z; }
const K = X.map(a => Float64Array.from(X.map(b => dot(a, b))));
const norm = v => { const s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map(x => x / s); };
const cos = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const EV = KB.map(e => norm(emb(docText(e))));
const Yb = train.map(r => norm(emb(r.embText))), Yc = train.map(r => { const v = new Float64Array(KB.length); v[idx.get(r.y)] = 1; return v; });
const results = [];
for (const lam of [0.1, 0.3, 1]) {
  const A = K.map((r, i) => { const c = Float64Array.from(r); c[i] += lam; return c; });
  const Mb = choleskySolve(A, Yb), Mc = choleskySolve(A, Yc);
  const pred = (q, M) => { const x = feat(q), k = X.map(b => dot(x, b)), m = M[0].length, o = new Float64Array(m);
    for (let i = 0; i < n; i++) if (k[i]) for (let c = 0; c < m; c++) o[c] += k[i] * M[i][c]; return o; };
  const row = { lam };
  for (const [name, set] of Object.entries(tests)) {
    let a = 0, b = 0, c = 0, d = 0, e = 0;
    for (const t of set) {
      const lex = search(t.q), lexTop = lex[0] ? lex[0].e.id : null;
      const qb = norm(Array.from(pred(t.q, Mb))), sb = EV.map(v => cos(qb, v)), topB = KB[sb.indexOf(Math.max(...sb))].id;
      const pc = pred(t.q, Mc), topC = KB[pc.indexOf(Math.max(...pc))].id;
      // D: lexical when its score is strong (>= 4, decideTier's lowest act band), otherwise the distilled vector
      const topD = lex[0] && lex[0].s >= 4 ? lexTop : topB;
      // E: the real bge-m3 (the ceiling: a model per question)
      const qe = norm(emb(t.q)), se = EV.map(v => cos(qe, v)), topE = KB[se.indexOf(Math.max(...se))].id;
      if (t.gold.includes(lexTop)) a++; if (t.gold.includes(topB)) b++; if (t.gold.includes(topC)) c++; if (t.gold.includes(topD)) d++; if (t.gold.includes(topE)) e++;
    }
    row[name] = [a, b, c, d, e, set.length];
  }
  results.push(row);
}
const pct = (x, n) => `${(100 * x / n).toFixed(1)}%`;
let md = `# Distilling bge-m3 into a model-free trigram map (offline ridge; katgpt-canon source_adapter idea)\n\n`;
md += `Train ${n} items (132 entry texts + Thai paraphrases 0, 2 + English 0). Labels unreviewed. Test sets never used in training.\n`;
md += `A = shipped lexical; B = distilled vector (trigrams -> bge-m3 space, cosine to entry vectors); C = trigram linear classifier (one-hot target); D = A if lexical score >= 4 else B; E = real bge-m3 per question (needs a model).\n\n`;
md += `| λ | set | n | A lexical | B distilled | C classifier | D hybrid A/B | E bge-m3 (ceiling) |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of results) for (const k of Object.keys(tests)) { const [a, b, c, d, e, N] = r[k]; md += `| ${r.lam} | ${k} | ${N} | ${pct(a, N)} | ${pct(b, N)} | ${pct(c, N)} | ${pct(d, N)} | ${pct(e, N)} |\n`; }
md += `\nCaveat: the held-out paraphrases come from the same model and prompt as the training ones (optimistic for B/C); eval52 / FAQ are the out-of-distribution check.\n`;
if (outPath) writeFileSync(outPath, md); console.log(md);
