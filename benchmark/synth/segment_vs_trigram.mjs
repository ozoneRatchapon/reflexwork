// Experiment (read-only): would a Thai WORD vocabulary (dictionary-based segmentation) beat character trigrams for finding the right entry?
// Stand-in for a vocabulary: Node's ICU Thai word-break dictionary (Intl.Segmenter). Same scoring everywhere: cosine of idf-weighted binary
// feature sets (the shipped search's shape, without its overlap lift / score bands), so only the FEATURE changes.
// Features: trigram (control = what ships) | icu words | words + trigrams | words + word bigrams.
// Test sets: held-out Thai paraphrases (train paraphrases 0, 2 are NOT used here), eval52, official FAQ th, English paraphrases.
// Run: node benchmark/synth/segment_vs_trigram.mjs [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const { shipped, gramSet } = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn {shipped:_jsSearch, gramSet:_jsGramSet};'))(KB);
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const words = t => [...seg.segment(String(t).toLowerCase())].filter(s => s.isWordLike).map(s => s.segment);
const feats = {
  trigram: t => gramSet(String(t).toLowerCase()),
  words: t => new Set(words(t)),
  'words+trigram': t => new Set([...words(t), ...gramSet(String(t).toLowerCase())]),
  'words+bigram': t => { const w = words(t); return new Set([...w, ...w.slice(1).map((x, i) => w[i] + '\u0001' + x)]); },
};
const docs = KB.map(e => e.keywords);
function build(f) {
  const D = docs.map(d => f(d)), df = new Map();
  for (const s of D) for (const g of s) df.set(g, (df.get(g) || 0) + 1);
  const idf = g => Math.log((KB.length + 1) / ((df.get(g) || 0) + 1)) + 1;
  const vec = s => { const m = new Map(); let n = 0; for (const g of s) { const w = idf(g); m.set(g, w); n += w * w; } return { m, n: Math.sqrt(n) || 1 }; };
  const DV = D.map(vec);
  return q => { const qv = vec(f(q)); const sc = DV.map((d, i) => { let dot = 0; for (const [g, w] of qv.m) { const x = d.m.get(g); if (x) dot += w * x; } return [i, dot / (qv.n * d.n)]; }); return sc.sort((a, b) => b[1] - a[1]); };
}
const items = JSON.parse(R('benchmark/synth/questions_001.json')).items.filter(x => x.q);
const grp = k => { const m = new Map(); for (const x of items.filter(x => x.kind === k)) { const a = m.get(x.source_id) || []; a.push(x); m.set(x.source_id, a); } return m; };
const TH = grp('para_th'), EN = grp('para_en');
const evalSrc = R('tests/kb_search.test.mjs');
const SETS = {
  'Thai paraphrases (held-out half)': [...TH.values()].flatMap(a => a.filter((_, i) => i % 2 === 1)).map(x => ({ q: x.q, gold: [x.source_id] })),
  'English paraphrases': [...EN.values()].flat().map(x => ({ q: x.q, gold: [x.source_id] })),
  'eval52': [...evalSrc.matchAll(/^\s*\['([^']+)',\s*'([^']+)',\s*'[^']*'\],?$/gm)].map(m => ({ q: m[1], gold: [m[2]] })),
  'official FAQ (th)': JSON.parse(R('benchmark/field/faq_questions.json')).items.filter(x => x.student && x.gold_kb_ids.length).map(x => ({ q: x.th, gold: x.gold_kb_ids })),
};
const pct = (a, n) => `${(100 * a / n).toFixed(1)}%`;
const arms = { 'shipped search (control)': q => shipped(q).map(r => [KB.indexOf(r.e), r.s]), ...Object.fromEntries(Object.entries(feats).map(([k, f]) => [k + ' (cosine only)', build(f)])) };
let md = `# Thai word vocabulary (ICU dictionary segmentation) vs character trigrams, first-right\n\nOnly the feature changes; the cosine arms share one scoring. Labels of the generated questions are unreviewed.\n\n| arm | ${Object.keys(SETS).join(' | ')} |\n|---|${Object.keys(SETS).map(() => '---').join('|')}|\n`;
for (const [name, fn] of Object.entries(arms)) {
  const cells = Object.values(SETS).map(S => { let ok = 0; for (const t of S) { const r = fn(t.q); if (r.length && t.gold.includes(KB[r[0][0]].id)) ok++; } return `${pct(ok, S.length)} (${ok}/${S.length})`; });
  md += `| ${name} | ${cells.join(' | ')} |\n`;
}
md += `\nSegmenter: Intl.Segmenter('th'), Node ${process.version}, ICU ${process.versions.icu}. It splits "ใบรับรอง" as "ใบรับ | รอง": a dictionary is only as good as its entries for THIS domain.\n`;
if (process.argv[2]) writeFileSync(process.argv[2], md); console.log(md);
