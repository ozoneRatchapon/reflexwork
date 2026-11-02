// Reproducible comparison of ReflexWork's KB retrieval against standard baselines on the labelled eval in tests/kb_search.test.mjs.
//   python3 submissions/build_knowledge_index.py && node benchmark/compare/compare_retrievers.mjs [--json out.json]
//
// What is compared (all see the SAME documents = the `keywords` text of each KB entry, and the SAME queries):
//   ours        the production search() (JS twin of crates/reflex-wasm::kb_search; lockstep with WASM is tested separately)
//   cosine      the same binary TF-IDF vectors, ranked by cosine only            (ablation: drops the symbolic overlap signal)
//   overlap     the same grams, ranked by lexical overlap count only             (ablation: drops the vector signal)
//   bm25_char3  BM25 (k1=1.2, b=0.75) over character trigrams                    (standard lexical baseline, Thai-safe tokenisation)
//   bm25_word   BM25 over whitespace tokens                                      (naive baseline: Thai has no spaces)
// Two questions, because they are different problems:
//   (1) RANKING       - is the right entry first? recall@1/@3, MRR. (ours ranks by cosine, overlap breaks ties.)
//   (2) CONFIDENCE    - can the system tell when it is right? That is what lets it answer without an LLM and abstain otherwise.
//                       Selective-prediction view: error at matched coverage, AURC, AUROC. Off-corpus queries count as errors if answered.
// Every baseline gets the better of two confidence definitions (top score, or top-1 minus top-2 margin).
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const idxPath = join(root, 'submissions/ui/knowledge-index.json');
if (!existsSync(idxPath)) { console.error('missing knowledge-index.json: run python3 submissions/build_knowledge_index.py'); process.exit(2); }
const KB = JSON.parse(readFileSync(idxPath, 'utf8'));
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const evalSrc = readFileSync(join(root, 'tests/kb_search.test.mjs'), 'utf8');

// ---- production code and the labelled eval, taken from their single sources of truth (no copies) ----------------------------------
const pm = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/);
const decideTier = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const { jsSearch, gramSet } = new Function('KB', pm[0].replace(/\nfunction search\(q\)\{$/, '\nreturn {jsSearch:_jsSearch, gramSet:_jsGramSet};'))(KB);
const CASES = [...evalSrc.matchAll(/^\s*\['([^']+)',\s*(null|'[^']*'),\s*'([^']*)'\],?$/gm)].map(m => ({ q: m[1], exp: m[2] === 'null' ? null : m[2].slice(1, -1), kind: m[3] }));
const ALT = new Function('return ' + evalSrc.match(/const ALT = (\{[\s\S]*?\n\});/)[1])();
const ids = new Set(KB.map(e => e.id));
const Q = CASES.filter(c => c.exp === null || ids.has(c.exp)).map(c => ({ ...c, ok: new Set(c.exp === null ? [] : [c.exp, ...(ALT[c.q] || [])]) }));

// ---- baselines --------------------------------------------------------------------------------------------------------------------------
const docs = KB.map(e => e.keywords), N = docs.length;
const trig = s => { s = String(s).toLowerCase(); const out = []; for (let i = 0; i < s.length - 2; i++) { const t = s.slice(i, i + 3).trim(); if (t.length === 3) out.push(t); } return out; };
const words = s => String(s).toLowerCase().split(/\s+/).filter(w => w.length > 1);
const counts = arr => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return m; };
function bm25(tokenize) {
  const D = docs.map(d => counts(tokenize(d))), len = D.map(m => [...m.values()].reduce((a, b) => a + b, 0)), avg = len.reduce((a, b) => a + b, 0) / N, df = new Map();
  for (const m of D) for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
  return q => { const qs = new Set(tokenize(q)); return KB.map((e, i) => { let s = 0; for (const t of qs) { const f = D[i].get(t); if (!f) continue; const n = df.get(t), idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len[i] / avg)); } return { id: e.id, conf: s }; }); };
}
const idfOf = (() => { const df = new Map(); for (const d of docs) for (const g of gramSet(d)) df.set(g, (df.get(g) || 0) + 1); return g => Math.log((N + 1) / ((df.get(g) || 0) + 1)) + 1; })();
const vec = gs => { const v = new Map(); let n2 = 0; for (const g of gs) { const w = idfOf(g); v.set(g, w); n2 += w * w; } const nr = Math.sqrt(n2) || 1; for (const [k, w] of v) v.set(k, w / nr); return v; };
const DV = docs.map(d => vec(gramSet(d)));
const cosOf = q => { const qv = vec(gramSet(q)); return DV.map(dv => { let c = 0; for (const [g, w] of qv) { const x = dv.get(g); if (x) c += w * x; } return c; }); };
const ovOf = q => { const qg = gramSet(q); return docs.map(d => { let o = 0; for (const g of qg) if (d.includes(g)) o++; return o; }); };
const bm25c = bm25(trig), bm25w = bm25(words);
const METHODS = {
  ours:       q => { const r = jsSearch(q); return r.map((x, i) => ({ id: x.e.id, conf: x.s + x.cos / 10, f: i ? null : [x.cos, x.cos - (r[1] ? r[1].cos : 0), x.overlap, x.overlap - (r[1] ? r[1].overlap : 0)] })); },   // production order; s = production score (the gate uses s >= 4), cosine breaks ties inside a score
  cosine:     q => { const c = cosOf(q); return KB.map((e, i) => ({ id: e.id, conf: c[i] })); },
  overlap:    q => { const o = ovOf(q); return KB.map((e, i) => ({ id: e.id, conf: o[i] })); },
  bm25_char3: q => bm25c(q),
  bm25_word:  q => bm25w(q),
};
const rank = (list, keepOrder) => (keepOrder ? list : [...list].sort((a, b) => b.conf - a.conf || (a.id < b.id ? -1 : 1))).filter(x => x.conf > 0);

// ---- metrics ----------------------------------------------------------------------------------------------------------------------------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
function choose(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
const mcnemar = (b, c) => { const n = b + c; if (!n) return 1; let p = 0; for (let k = 0; k <= Math.min(b, c); k++) p += choose(n, k) / 2 ** n; return Math.min(1, 2 * p); };
// risk-coverage with ties handled by expectation (a coarse integer score must not win or lose on tie order)
function riskCurve(items) { // items: [{conf, wrong:0|1}] -> {aurc, errAtCoverage(m), auroc}
  const s = [...items].sort((a, b) => b.conf - a.conf), n = s.length, risk = [], cumErr = [0];
  let i = 0, err = 0;
  while (i < n) { let j = i; while (j < n && s[j].conf === s[i].conf) j++; const g = j - i, w = s.slice(i, j).reduce((a, x) => a + x.wrong, 0);
    for (let t = 1; t <= g; t++) { const e = err + t * w / g; risk.push(e / (i + t)); cumErr.push(e); } err += w; i = j; }
  const pos = items.filter(x => !x.wrong), neg = items.filter(x => x.wrong); let u = 0;
  for (const p of pos) for (const q of neg) u += p.conf > q.conf ? 1 : p.conf === q.conf ? 0.5 : 0;
  return { aurc: risk.reduce((a, b) => a + b, 0) / n, errAt: m => cumErr[Math.min(m, n)], auroc: pos.length && neg.length ? u / (pos.length * neg.length) : NaN };
}

const run = {};
for (const [name, fn] of Object.entries(METHODS)) {
  run[name] = Q.map(c => { const r = rank(fn(c.q), name === 'ours'); const top = r[0], pos = r.findIndex(x => c.ok.has(x.id));
    return { c, top, f: name === 'ours' && r[0] ? r[0].f : null, r1: top && c.ok.has(top.id) ? 1 : 0, r3: r.slice(0, 3).some(x => c.ok.has(x.id)) ? 1 : 0, rr: pos >= 0 ? 1 / (pos + 1) : 0, conf: top ? top.conf : 0, margin: top ? top.conf - (r[1] ? r[1].conf : 0) : 0 }; });
}
const lab = Q.map((c, i) => i).filter(i => Q[i].exp !== null), nLab = lab.length;
// 'answered' = what the page really does: decideTier() (acts from score 3 unless two entries are within 1 point; gate ~0.061 as in the web chat)
let answeredOurs = 0, shippedWrong = 0;
for (const c of Q) { const v = decideTier({ gate: 0.061, ranked: jsSearch(c.q) }); if (v.action === 'act') { answeredOurs++; if (c.exp === null || !c.ok.has(v.entry.id)) shippedWrong++; } }
const rows = {};
for (const [name, rs] of Object.entries(run)) {
  const wrong = x => (x.c.exp === null || !x.r1) ? 1 : 0;
  const cand = name === 'ours' ? [rs.map(x => ({ conf: x.conf, wrong: wrong(x) }))] : [rs.map(x => ({ conf: x.conf, wrong: wrong(x) })), rs.map(x => ({ conf: x.margin, wrong: wrong(x) }))];
  const curves = cand.map(riskCurve), best = curves.reduce((a, b) => (b.aurc < a.aurc ? b : a));
  const r1 = lab.reduce((a, i) => a + rs[i].r1, 0), r3 = lab.reduce((a, i) => a + rs[i].r3, 0), mrr = lab.reduce((a, i) => a + rs[i].rr, 0) / nLab;
  rows[name] = { r1, r3, mrr, ci: wilson(r1, nLab), errAtMatched: name === 'ours' ? shippedWrong : best.errAt(answeredOurs), aurc: best.aurc, auroc: Math.max(...curves.map(c => c.auroc)) };   // ours: the errors the page really makes
}
function logistic(X, y, lam = 0.5, it = 1500, lr = 0.2) { // L2-regularised logistic regression on standardised features
  const d = X[0].length, mu = Array(d).fill(0), sd = Array(d).fill(0);
  X.forEach(r => r.forEach((v, j) => mu[j] += v / X.length)); X.forEach(r => r.forEach((v, j) => sd[j] += (v - mu[j]) ** 2 / X.length)); sd.forEach((v, j) => sd[j] = Math.sqrt(v) || 1);
  const Z = r => r.map((v, j) => (v - mu[j]) / sd[j]); const Xs = X.map(Z); let w = Array(d).fill(0), b = 0;
  for (let t = 0; t < it; t++) { const gw = Array(d).fill(0); let gb = 0;
    Xs.forEach((r, i) => { const p = 1 / (1 + Math.exp(-(b + r.reduce((a, v, j) => a + v * w[j], 0)))); const e = p - y[i]; r.forEach((v, j) => gw[j] += e * v / X.length); gb += e / X.length; });
    w = w.map((v, j) => v - lr * (gw[j] + lam * v / X.length)); b -= lr * gb; }
  return r => 1 / (1 + Math.exp(-(b + Z(r).reduce((a, v, j) => a + v * w[j], 0))));
}
{ const rs = run.ours, wrongOf = x => (x.c.exp === null || !x.r1) ? 1 : 0, ok = rs.map(x => !!x.f);
  const conf = rs.map((x, i) => { if (!ok[i]) return 0; const tr = rs.map((_, j) => j).filter(j => j !== i && ok[j]); const m = logistic(tr.map(j => rs[j].f), tr.map(j => wrongOf(rs[j]))); return 1 - m(x.f); });
  run.ours_learned = rs.map((x, i) => ({ ...x, conf: conf[i], margin: 0 }));
  const cv = riskCurve(rs.map((x, i) => ({ conf: conf[i], wrong: wrongOf(x) })));
  rows.ours_learned = { ...rows.ours, aurc: cv.aurc, auroc: cv.auroc, errAtMatched: cv.errAt(answeredOurs) }; }
const kinds = [...new Set(Q.map(c => c.kind))];
const rng = mulberry32(20261102), B = 4000;
function paired(a, b) { // bootstrap CI for recall@1(a) - recall@1(b), plus exact McNemar on the discordant pairs
  const x = lab.map(i => run[a][i].r1), y = lab.map(i => run[b][i].r1); let only = 0, onlyB = 0; x.forEach((v, i) => { if (v && !y[i]) only++; if (!v && y[i]) onlyB++; });
  const d = []; for (let t = 0; t < B; t++) { let s = 0; for (let k = 0; k < nLab; k++) { const i = Math.floor(rng() * nLab); s += x[i] - y[i]; } d.push(s / nLab); } d.sort((p, q) => p - q);
  return { diff: (x.reduce((p, q) => p + q, 0) - y.reduce((p, q) => p + q, 0)) / nLab, lo: d[Math.floor(B * 0.025)], hi: d[Math.floor(B * 0.975)], only, onlyB, p: mcnemar(only, onlyB) };
}
const pct = x => (100 * x).toFixed(0) + '%', f2 = x => x.toFixed(2);
const out = [];
out.push(`## KB retrieval - ${KB.length} entries, ${Q.length} queries (${nLab} labelled + ${Q.length - nLab} off-corpus)\n`);
out.push('### 1. Ranking: is the right entry first?\n');
out.push('| method | recall@1 | 95% CI (Wilson) | recall@3 | MRR |\n|---|---|---|---|---|');
for (const [n, r] of Object.entries(rows).filter(([k]) => k !== 'ours_learned')) out.push(`| ${n} | ${r.r1}/${nLab} = ${pct(r.r1 / nLab)} | ${pct(r.ci[0])}-${pct(r.ci[1])} | ${r.r3}/${nLab} = ${pct(r.r3 / nLab)} | ${f2(r.mrr)} |`);
out.push('\nrecall@1 by query kind (n):\n\n| method | ' + kinds.filter(k => k !== 'offcorpus').map(k => `${k} (${Q.filter(c => c.kind === k).length})`).join(' | ') + ' |\n|---|' + kinds.filter(k => k !== 'offcorpus').map(() => '---').join('|') + '|');
for (const n of Object.keys(run).filter(k => k !== 'ours_learned')) out.push(`| ${n} | ` + kinds.filter(k => k !== 'offcorpus').map(k => { const ix = lab.filter(i => Q[i].kind === k); return `${ix.reduce((a, i) => a + run[n][i].r1, 0)}/${ix.length}`; }).join(' | ') + ' |');
out.push('\nPaired difference in recall@1, ours minus baseline (bootstrap 95% CI, 4000 resamples, seed 20261102; exact McNemar on discordant pairs):\n\n| vs | diff | 95% CI | ours-only right | baseline-only right | p |\n|---|---|---|---|---|---|');
for (const n of Object.keys(run).filter(k => k !== 'ours' && k !== 'ours_learned')) { const p = paired('ours', n); out.push(`| ${n} | ${(100 * p.diff).toFixed(0)}pp | ${(100 * p.lo).toFixed(0)}..${(100 * p.hi).toFixed(0)}pp | ${p.only} | ${p.onlyB} | ${p.p.toFixed(3)} |`); }
out.push(`\n### 2. Confidence: can it tell when it is right? (this is what decides "answer without an LLM" vs "abstain")\n`);
out.push(`The page answers ${answeredOurs}/${Q.length} queries on its own (decideTier: act). Error counts below are at that SAME coverage (for \`ours\`: the errors the page really makes; for the others: their wrong answers among their ${answeredOurs} most-confident); an off-corpus query that gets answered is an error.\n`);
out.push('| method | wrong among the ' + answeredOurs + ' most-confident answers | AURC (lower = better) | AUROC (higher = better) |\n|---|---|---|---|');
for (const [n, r] of Object.entries(rows)) out.push(`| ${n} | ${f2(r.errAtMatched)} (${pct(r.errAtMatched / answeredOurs)}) | ${f2(r.aurc)} | ${f2(r.auroc)} |`);
out.push('\n`ours_learned` = the same ranking as `ours`, confidence from a logistic regression over (cosine, cosine margin, overlap, overlap lead), each row scored by a model trained WITHOUT it (leave-one-out). Exploratory: 52 queries and a handful of errors cannot support a claim either way.');
const text = out.join('\n');
console.log(text);
const ji = process.argv.indexOf('--json');
if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify({ n: Q.length, labelled: nLab, answeredOurs, shippedWrong, rows }, null, 1));
