// Experiment (read-only): does adding model-written questions to each entry's search words (doc2query, done OFFLINE) help the lexical
// search, while the chat stays modelless at run time? Split per entry by a fixed seed: half of each entry's Thai paraphrases go into
// its keywords ("train"), the other half + all English + near-misses are the test. Also re-checks the existing sets so a gain on
// synthetic questions is not paid for elsewhere: the 52-query eval and the official FAQ (benchmark/field).
// Run: node benchmark/synth/doc2query.mjs [questions.json] [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const [qPath = join(root, 'benchmark/synth/questions_001.json'), outPath] = process.argv.slice(2);
const KB0 = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const mk = KB => new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KB);
const decide = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const items = JSON.parse(readFileSync(qPath, 'utf8')).items.filter(x => x.q);
// fixed split: within each entry, Thai paraphrases with an even index (0, 2) train, odd (1, 3) test
const byEntry = new Map(); for (const x of items.filter(x => x.kind === 'para_th')) { const a = byEntry.get(x.source_id) || []; a.push(x); byEntry.set(x.source_id, a); }
const train = new Map([...byEntry].map(([id, a]) => [id, a.filter((_, i) => i % 2 === 0).map(x => x.q)]));
const testTh = [...byEntry.values()].flatMap(a => a.filter((_, i) => i % 2 === 1));
const testEn = items.filter(x => x.kind === 'para_en'), near = items.filter(x => x.kind === 'near_miss');
const evalSrc = R('tests/kb_search.test.mjs');
const E52 = [...evalSrc.matchAll(/^\s*\['([^']+)',\s*(null|'[^']*'),\s*'[^']*'\],?$/gm)].map(m => ({ q: m[1], gold: m[2] === 'null' ? [] : [m[2].slice(1, -1)] }));
const FAQ = JSON.parse(R('benchmark/field/faq_questions.json')).items.filter(x => x.student && x.gold_kb_ids.length).map(x => ({ q: x.th, gold: x.gold_kb_ids }));

// alias docs: each train paraphrase is its own searchable item that points back to its entry; an entry ranks by its best item,
// and the list is de-duplicated so the runner-up (which decideTier's margin reads) is a different entry
const aliasKB = [...KB0, ...KB0.flatMap(e => (train.get(e.id) || []).map((q, i) => ({ ...e, id: `${e.id}#a${i}`, title: q, keywords: q.toLowerCase(), _base: e.id })))];
const mkAlias = KB => { const s = mk(KB); return q => { const seen = new Set(), out = [];
  for (const r of s(q)) { const b = r.e._base || r.e.id; if (seen.has(b)) continue; seen.add(b); out.push({ ...r, e: KB0.find(e => e.id === b) }); } return out; }; };
const variants = {
  'as shipped': KB0,
  'alias items (each paraphrase its own item, best item wins)': { alias: aliasKB },
  'doc2query (half the Thai paraphrases added to keywords)': KB0.map(e => ({ ...e, keywords: [e.keywords, ...(train.get(e.id) || [])].join(' ').toLowerCase() })),
};
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '-';
const score = (search, set, neg = false) => { let r1 = 0, act = 0, wrong = 0;
  for (const x of set) { const r = search(x.q), top = r[0] ? r[0].e.id : null, a = decide({ gate: 0.061, ranked: r }).action === 'act';
    const ok = neg ? false : (x.gold || [x.source_id]).includes(top); if (ok) r1++; if (a) act++; if (a && (neg ? top === x.source_id : !ok)) wrong++; }
  return { r1, act, wrong, n: set.length }; };
let md = `# doc2query experiment (offline question expansion, modelless at run time)\n\nQuestions: \`${qPath.replace(root + '/', '')}\`, unreviewed model labels. Split per entry: Thai paraphrases 0, 2 -> keywords; 1, 3 -> test.\n\n`;
md += `| variant | Thai held-out: 1st right | answered wrong | English: 1st right | near-miss answered with its own entry | eval52: 1st right | official FAQ (th): 1st right |\n|---|---|---|---|---|---|---|\n`;
for (const [name, KB] of Object.entries(variants)) { const s = KB.alias ? mkAlias(KB.alias) : mk(KB);
  const a = score(s, testTh), b = score(s, testEn), c = score(s, near, true), d = score(s, E52.filter(x => x.gold.length)), f = score(s, FAQ);
  md += `| ${name} | ${pct(a.r1, a.n)} (${a.r1}/${a.n}) | ${pct(a.wrong, a.n)} | ${pct(b.r1, b.n)} | ${pct(c.wrong, c.n)} | ${pct(d.r1, d.n)} (${d.r1}/${d.n}) | ${pct(f.r1, f.n)} (${f.r1}/${f.n}) |\n`; }
md += `\nCaveats: the held-out paraphrases come from the same model and prompt as the added ones (optimistic); labels are not reviewed yet; the eval52 / FAQ columns are the regression check.\n`;
if (outPath) writeFileSync(outPath, md); console.log(md);
