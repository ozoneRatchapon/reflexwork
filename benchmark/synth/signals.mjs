// Experiment (read-only): which model-free signals separate "the entry answers it" (Thai paraphrase) from "near-miss of the same
// entry"? AUROC per signal, candidate = the source entry when it is ranked 1st (the case where the bot would answer it).
// Signals: lexical top score s1, margin s1-s2, cosine c1, cosine margin, answer-type match (answer_type.mjs patterns), and a
// rank fusion (katgpt distance_abstain lesson: fuse on ranks, not raw scales). Run: node benchmark/synth/signals.mjs [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KBa = JSON.parse(R('submissions/ui/knowledge-index.json')), KB = new Map(KBa.map(e => [e.id, e])), html = R('submissions/ui/chatbot.html');
const search = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KBa);
const at = R('benchmark/synth/answer_type.mjs');
const { ASK, HAS } = new Function(at.match(/const TH_MON[\s\S]*?\n};\n[\s\S]*?const HAS = \{[\s\S]*?\n\};\n/)[0] + 'return {ASK, HAS};')();
const typeOk = (q, e) => { const a = Object.keys(ASK).filter(k => ASK[k].test(q)); return a.length === 0 || a.some(k => HAS[k].test(`${e.title}\n${e.answer}`)) ? 1 : 0; };
const items = JSON.parse(R('benchmark/synth/questions_001.json')).items.filter(x => x.q && KB.has(x.source_id) && (x.kind === 'para_th' || x.kind === 'near_miss'));
const rows = [];
for (const x of items) { const r = search(x.q); if (!r[0] || r[0].e.id !== x.source_id) continue;   // only where the bot would pick the source entry
  rows.push({ pos: x.kind === 'para_th', s1: r[0].s, m: r[0].s - (r[1] ? r[1].s : 0), c1: +r[0].cos, cm: +r[0].cos - (r[1] ? +r[1].cos : 0), t: typeOk(x.q, r[0].e) }); }
const auroc = f => { const P = rows.filter(r => r.pos).map(f), N = rows.filter(r => !r.pos).map(f); let w = 0; for (const p of P) for (const n of N) w += p > n ? 1 : p === n ? 0.5 : 0; return w / (P.length * N.length); };
const rank = f => { const v = rows.map(f), s = [...v].sort((a, b) => a - b); return v.map(x => s.indexOf(x) / s.length); };
const rc1 = rank(r => r.c1), rcm = rank(r => r.cm); rows.forEach((r, i) => { r.fuse = rc1[i] + rcm[i] + r.t; r.fuse2 = rc1[i] + r.t; });
const S = { 'lexical score s1 (shipped)': r => r.s1, 'score margin s1-s2': r => r.m, 'cosine c1': r => r.c1, 'cosine margin c1-c2': r => r.cm, 'answer-type match (0/1)': r => r.t,
  'rank fusion: c1 + answer-type': r => r.fuse2, 'rank fusion: c1 + cos margin + answer-type': r => r.fuse };
let md = `# Model-free abstain signals: AUROC (Thai paraphrase vs near-miss, when the source entry is ranked 1st)\n\n`;
md += `n = ${rows.filter(r => r.pos).length} paraphrases vs ${rows.filter(r => !r.pos).length} near-misses (unreviewed labels). 0.5 = no separation. For reference: bge-m3 similarity to the entry 0.850 (003, needs a model).\n\n| signal | AUROC |\n|---|---|\n`;
for (const [k, f] of Object.entries(S)) md += `| ${k} | ${auroc(f).toFixed(3)} |\n`;
if (process.argv[2]) writeFileSync(process.argv[2], md); console.log(md);
