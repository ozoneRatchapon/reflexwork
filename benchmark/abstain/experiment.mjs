// Run: node benchmark/abstain/experiment.mjs   (needs python3 submissions/build_knowledge_index.py). Read-only; ~1 min.
// Result + reading: benchmark/abstain/001_2026-11-06.md
// Read-only experiment: does a Temper-style calibrated abstain (katgpt-extract/temper.rs: answer iff calibrated confidence >= tau AND best score >= delta)
// separate "answer is right" from "should not answer" better than the shipped decideTier thresholds?  Cross-validated; nothing is written to the repo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html'), evalSrc = R('tests/kb_search.test.mjs');
const { jsSearch: search, gramSet } = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn {jsSearch:_jsSearch, gramSet:_jsGramSet};'))(KB);
const DF = new Map(); const GS = new Map(KB.map(e => [e.id, gramSet(e.keywords)])); for (const g of GS.values()) for (const t of g) DF.set(t, (DF.get(t) || 0) + 1);
const idf = t => Math.log((KB.length + 1) / ((DF.get(t) || 0) + 1));
const decide = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const FAQ = JSON.parse(R('benchmark/field/faq_questions.json')).items.map(it => ({ ...it, gold: new Set(it.gold_kb_ids) }));
const typo = q => { const c = [...q]; let n = 0; for (let i = 2; i < c.length - 1 && n < 2; i += 7) { if (/[ก-ฮ]/.test(c[i])) { c.splice(i, 1); n++; } } return c.join(''); };
const short = q => q.split(/\s+/).slice(0, 6).join(' ');
const cov = FAQ.filter(r => r.student && r.gold.size), unc = FAQ.filter(r => r.student && !r.gold.size), staff = FAQ.filter(r => !r.student);
const CASES = [...evalSrc.matchAll(/^\s*\['([^']+)',\s*(null|'[^']*'),\s*'([^']*)'\],?$/gm)].map(m => ({ q: m[1], exp: m[2] === 'null' ? null : m[2].slice(1, -1) }));
const ALT = new Function('return ' + evalSrc.match(/const ALT = (\{[\s\S]*?\n\});/)[1])(); const ids = new Set(KB.map(e => e.id));
const A = CASES.filter(c => c.exp === null || ids.has(c.exp)).map(c => ({ q: c.q, gold: new Set(c.exp === null ? [] : [c.exp, ...(ALT[c.q] || [])]), group: 'A52' }));
// items: {q, gold, group, leaky}  leaky = the KB entry was compiled from this very FAQ text (routing fidelity, not generalisation)
const items = [...A.map(x => ({ ...x, leaky: false })),
  ...cov.map(r => ({ q: r.th, gold: r.gold, group: 'faqTh', leaky: true })), ...cov.map(r => ({ q: short(r.th), gold: r.gold, group: 'faqShort', leaky: true })),
  ...cov.map(r => ({ q: typo(r.th), gold: r.gold, group: 'faqTypo', leaky: false })), ...cov.map(r => ({ q: r.en, gold: r.gold, group: 'faqEn', leaky: false })),
  ...unc.flatMap(r => [{ q: r.th, gold: new Set(), group: 'uncTh', leaky: false }, { q: r.en, gold: new Set(), group: 'uncEn', leaky: false }]),
  ...staff.flatMap(r => [{ q: r.th, gold: new Set(), group: 'staffTh', leaky: false }, { q: r.en, gold: new Set(), group: 'staffEn', leaky: false }])];
for (const it of items) { const r = search(it.q), a = r[0], b = r[1]; it.ranked = r;
  it.f = { s1: a ? a.s : 0, s2: b ? b.s : 0, c1: a ? +a.cos : 0, c2: b ? +b.cos : 0, o1: a ? a.overlap : 0 };
  it.f.ms = it.f.s1 - it.f.s2; it.f.mc = it.f.c1 - it.f.c2;
  { const qg = [...gramSet(it.q)], eg = a ? GS.get(a.e.id) : new Set(); const tot = qg.reduce((x, t) => x + idf(t), 0) || 1; it.f.cov = qg.length ? qg.filter(t => eg.has(t)).length / qg.length : 0; it.f.icov = qg.reduce((x, t) => x + (eg.has(t) ? idf(t) : 0), 0) / tot; }
  it.pos = !!a && it.gold.has(a.e.id);                      // the top answer is right
  it.shipped = decide({ gate: 0.061, ranked: r }).action === 'act'; }
const sig = x => 1 / (1 + Math.exp(-x));
// ---- rules: each maps (features, params from the train fold) -> answer? ----
const quantile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const grid = (a, n) => { const out = new Set(); for (let i = 0; i <= n; i++) out.add(quantile(a, i / n)); return [...out]; };
const RULES = {
  'shipped (fixed thresholds)': null,
  'top score s1 >= t': { params: tr => grid(tr.map(x => x.f.s1), 40).map(t => ({ t })), ans: (f, p) => f.s1 >= p.t },
  'top cosine c1 >= t': { params: tr => grid(tr.map(x => x.f.c1), 40).map(t => ({ t })), ans: (f, p) => f.c1 >= p.t },
  'margin (c1-c2) >= t': { params: tr => grid(tr.map(x => x.f.mc), 40).map(t => ({ t })), ans: (f, p) => f.mc >= p.t },
  'TEMPER fused: sigmoid(margin/spread) >= tau AND c1 >= delta': { params: tr => { const spread = Math.max(1e-6, quantile(tr.filter(x => x.pos).map(x => x.f.mc), 0.75) - quantile(tr.filter(x => x.pos).map(x => x.f.mc), 0.25)) || 0.05;
      const out = []; for (const tau of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) for (const delta of grid(tr.map(x => x.f.c1), 20)) out.push({ tau, delta, spread }); return out; },
    ans: (f, p) => sig(f.mc / p.spread) >= p.tau && f.c1 >= p.delta },
};
// tiny logistic regression on the same features = what a calibrator could do at best with the signals we have (an upper bound, not modelless-by-default)
function fitLogit(tr, nf = 5) { const F = x => [x.f.s1, x.f.c1, x.f.ms, x.f.mc, x.f.o1 / 10, x.f.cov, x.f.icov].slice(0, nf); const J = [...Array(nf).keys()]; const mu = J.map(j => tr.reduce((a, x) => a + F(x)[j], 0) / tr.length), sd = J.map(j => Math.sqrt(tr.reduce((a, x) => a + (F(x)[j] - mu[j]) ** 2, 0) / tr.length) || 1);
  let w = Array(nf + 1).fill(0); const z = x => F(x).map((v, j) => (v - mu[j]) / sd[j]);
  for (let it = 0; it < 400; it++) { const g = Array(nf + 1).fill(0); for (const x of tr) { const zz = z(x), p = sig(w[5] + zz.reduce((a, v, j) => a + v * w[j], 0)), e = p - (x.pos ? 1 : 0); zz.forEach((v, j) => g[j] += e * v); g[nf] += e; } w = w.map((v, j) => v - 0.1 * g[j] / tr.length); }
  return x => sig(w[nf] + z(x).reduce((a, v, j) => a + v * w[j], 0)); }
RULES['NEW signal: query coverage by the top entry >= t'] = { params: tr => grid(tr.map(x => x.f.cov), 40).map(t => ({ t })), ans: (f, p) => f.cov >= p.t };
RULES['NEW signal: idf-weighted coverage >= t'] = { params: tr => grid(tr.map(x => x.f.icov), 40).map(t => ({ t })), ans: (f, p) => f.icov >= p.t };
RULES['logistic on all 5 features (upper bound of the signals)'] = { fit: true };
RULES['logistic on the 5 + 2 coverage features'] = { fit: 7 };
// ---- evaluation: 5-fold x 10 repeats; on each train fold choose the params that keep the shipped rule's recall and minimise wrong-answer rate on negatives; score on the test fold ----
let seed = 20261105; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function stats(set, ansFn) { const P = set.filter(x => x.pos), N = set.filter(x => !x.pos); // N = off-corpus + answers that would be wrong
  const rec = P.length ? P.filter(ansFn).length / P.length : 0, neg = N.length ? N.filter(ansFn).length / N.length : 0; return { rec, neg }; }
function evaluate(label, pool) {
  const res = {}; for (const name of Object.keys(RULES)) res[name] = { rec: 0, neg: 0, n: 0 }; const base = { rec: 0, neg: 0, n: 0 };
  for (let rep = 0; rep < 10; rep++) { const sh = shuffle(pool); const folds = [0, 1, 2, 3, 4].map(k => sh.filter((_, i) => i % 5 === k));
    for (let k = 0; k < 5; k++) { const te = folds[k], tr = folds.filter((_, i) => i !== k).flat(); const target = stats(tr, x => x.shipped).rec;
      const sb = stats(te, x => x.shipped); base.rec += sb.rec; base.neg += sb.neg; base.n++;
      for (const [name, rule] of Object.entries(RULES)) { let fn;
        if (!rule) fn = x => x.shipped;
        else if (rule.fit) { const m = fitLogit(tr, rule.fit === 7 ? 7 : 5); const cand = grid(tr.map(m), 40); let best = null; for (const t of cand) { const s = stats(tr, x => m(x) >= t); if (s.rec >= target - 1e-9 && (!best || s.neg < best.neg)) best = { t, ...s }; } const t = best ? best.t : cand[0]; fn = x => m(x) >= t; }
        else { let best = null; for (const p of rule.params(tr)) { const s = stats(tr, x => rule.ans(x.f, p)); if (s.rec >= target - 1e-9 && (!best || s.neg < best.neg)) best = { p, ...s }; } const p = best ? best.p : rule.params(tr)[0]; fn = x => rule.ans(x.f, p); }
        const s = stats(te, fn); res[name].rec += s.rec; res[name].neg += s.neg; res[name].n++; } } }
  console.log(`\n## ${label}  (${pool.length} queries: ${pool.filter(x => x.pos).length} right-answer positives, ${pool.filter(x => !x.pos).length} negatives)`);
  console.log('rule'.padEnd(64), 'keeps right answers', '  answers when it should not');
  for (const [name, r] of Object.entries(res)) console.log(name.padEnd(64), (100 * r.rec / r.n).toFixed(1).padStart(8) + ' %', (100 * r.neg / r.n).toFixed(1).padStart(18) + ' %'); }
evaluate('ALL data (includes FAQ-derived entries: routing fidelity)', items);
evaluate('GENERALISATION subset (no FAQ-derived plain-Thai rows)', items.filter(x => !x.leaky));
evaluate('OFF-CORPUS focus: only English / typo / 52-set positives + all uncovered + staff-only', items.filter(x => ['A52', 'faqEn', 'faqTypo', 'uncTh', 'uncEn', 'staffTh', 'staffEn'].includes(x.group)));
