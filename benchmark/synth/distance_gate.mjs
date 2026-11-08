// Experiment (read-only): a corpus-distance gate (idea seen on reflex.riir.ai: abstain when the question is far from every corpus exemplar;
// 53% of Reflex's abstains come from it) built from OUR exemplars = each entry's text + its generated TRAIN paraphrases. Does the distance
// of a question to the exemplars separate "the entry answers it" (held-out Thai paraphrase) from "near-miss of that entry"?
// Train exemplars: entry text + Thai paraphrases 0, 2 + English 0 (never the test ones, never a near-miss). Test: Thai 1, 3 vs ALL near-misses.
// Signals (AUROC, 0.5 = none): lexical score s1 (shipped); D_all = max trigram cosine to ANY exemplar (Reflex-style);
// D_top = max cosine to the exemplars of the top-1 entry; D_gap = D_top - best cosine to any OTHER entry's exemplars.
// Run: node benchmark/synth/distance_gate.mjs [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch, loadGramSet } from '../../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const search = pageSearch(KB, html), gramSet = loadGramSet();   // search: the page's (Rust); gramSet: the JS trigram set of the plan-015 snapshot (feature only)
const idx = new Set(KB.map(e => e.id));
const items = JSON.parse(R('benchmark/synth/questions_001.json')).items.filter(x => x.q && idx.has(x.source_id));
const group = kind => { const m = new Map(); for (const x of items.filter(x => x.kind === kind)) { const a = m.get(x.source_id) || []; a.push(x); m.set(x.source_id, a); } return m; };
const TH = group('para_th'), EN = group('para_en');
const ex = new Map(KB.map(e => [e.id, [`${e.title} ${String(e.answer).slice(0, 300)}`]]));
for (const [id, a] of TH) a.forEach((x, i) => { if (i % 2 === 0) ex.get(id).push(x.q); });
for (const [id, a] of EN) if (a[0]) ex.get(id).push(a[0].q);
const G = new Map([...ex].map(([id, a]) => [id, a.map(t => gramSet(t.toLowerCase()))]));
const cos = (a, b) => { if (a.size > b.size) [a, b] = [b, a]; let n = 0; for (const g of a) if (b.has(g)) n++; return a.size && b.size ? n / Math.sqrt(a.size * b.size) : 0; };
const best = (qg, id) => Math.max(0, ...G.get(id).map(g => cos(qg, g)));
const pos = [...TH.values()].flatMap(a => a.filter((_, i) => i % 2 === 1)), neg = items.filter(x => x.kind === 'near_miss');
const feat = x => { const r = search(x.q), top = r[0] ? r[0].e.id : null, qg = gramSet(x.q.toLowerCase());
  const all = KB.map(e => [e.id, best(qg, e.id)]).sort((a, b) => b[1] - a[1]);
  const dTop = top ? best(qg, top) : 0, dOther = Math.max(0, ...all.filter(([id]) => id !== top).map(a => a[1]));
  return { s1: r[0] ? r[0].s : 0, top, src: x.source_id, dAll: all[0][1], dTop, dGap: dTop - dOther }; };
const P = pos.map(feat), N = neg.map(feat);
const auroc = (p, n) => { let w = 0; for (const a of p) for (const b of n) w += a > b ? 1 : a === b ? 0.5 : 0; return w / (p.length * n.length); };
const rows = (p, n) => [['lexical score s1 (shipped)', 's1'], ['D_all: nearest exemplar anywhere (Reflex-style)', 'dAll'], ['D_top: nearest exemplar of the top-1 entry', 'dTop'], ['D_gap: D_top minus nearest other entry', 'dGap']]
  .map(([name, k]) => `| ${name} | ${auroc(p.map(r => r[k]), n.map(r => r[k])).toFixed(3)} |`).join('\n');
const Pt = P.filter(r => r.top === r.src), Nt = N.filter(r => r.top === r.src);
let md = `# Corpus-distance gate on generated questions (unreviewed labels)\n\nExemplars per entry: its text + train paraphrases. Test: ${P.length} held-out Thai paraphrases vs ${N.length} near-misses. AUROC, 0.5 = no separation.\n\n`;
md += `**All test questions**\n\n| signal | AUROC |\n|---|---|\n${rows(P, N)}\n\n`;
md += `**Only where the top-1 entry is the source entry** (the case where the bot would give that entry; ${Pt.length} vs ${Nt.length})\n\n| signal | AUROC |\n|---|---|\n${rows(Pt, Nt)}\n\n`;
// the job a distance gate is built for: a question the manual does not cover at all (official FAQ items with no KB entry, and the eval's off-corpus queries)
const faqNeg = JSON.parse(R('benchmark/field/faq_questions.json')).items.filter(x => !x.gold_kb_ids.length).map(x => ({ q: x.th, kind: 'uncovered_faq' }));
const evalNeg = [...R('tests/kb_search.test.mjs').matchAll(/^\s*\['([^']+)',\s*null,\s*'[^']*'\],?$/gm)].map(m => ({ q: m[1], kind: 'eval_off_corpus' }));
const O = [...faqNeg, ...evalNeg].map(x => ({ ...feat({ ...x, source_id: null }), kind: x.kind }));
md += `**Off-corpus questions** (${faqNeg.length} official FAQ items the manual does not cover + ${evalNeg.length} off-corpus eval queries) vs the ${P.length} held-out paraphrases\n\n| signal | AUROC |\n|---|---|\n${rows(P, O)}\n\n`;
md += `For reference: bge-m3 similarity to the entry 0.850 (003, needs a model); best earlier model-free fusion ~0.60 (007).\n`;
if (process.argv[2]) writeFileSync(process.argv[2], md); console.log(md);
