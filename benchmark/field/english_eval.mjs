// English retrieval on the real decision rule. Two sets: (1) held-out: 40 questions the assistant wrote in its own words (benchmark/field/english_heldout.json);
// (2) the school's own English FAQ wording for the covered items (NOT held-out once those questions are used as keywords - see the note in the output).
//   node benchmark/field/english_eval.mjs [--label "text"]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const twin = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;');
const search = new Function('KB', twin)(KB);
const decide = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const ids = new Set(KB.map(e => e.id));
const H = JSON.parse(readFileSync(join(root, 'benchmark/field/english_heldout.json'), 'utf8')).items;
const missing = H.flatMap(([, g]) => g).filter(x => !ids.has(x)); if (missing.length) console.log('WARNING unknown ids in held-out set:', [...new Set(missing)].join(', '));
const p = (k, n) => `${k}/${n} (${Math.round(100 * k / n)}%)`;
function score(set) { let t1 = 0, t3 = 0, right = 0, wrong = 0, asked = 0, handed = 0;
  for (const [q, gold] of set) { const g = new Set(gold), r = search(q), v = decide({ gate: 0.061, ranked: r }); if (g.has(r[0].e.id)) t1++; if (r.slice(0, 3).some(x => g.has(x.e.id))) t3++;
    if (v.action === 'act') (g.has(v.entry.id) ? right++ : wrong++); else if (v.action === 'disambiguate') asked++; else handed++; }
  const n = set.length; return `top-1 ${p(t1, n)} · top-3 ${p(t3, n)} · answered right ${p(right, n)} · answered WRONG ${p(wrong, n)} · asked ${asked} · handed on ${handed}`; }
const label = process.argv.includes('--label') ? process.argv[process.argv.indexOf('--label') + 1] : '';
console.log(`[${label}] held-out English (n=${H.length}): ${score(H)}`);
const FAQ = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items.filter(x => x.student && x.gold_kb_ids.length);
console.log(`[${label}] school English wording (n=${FAQ.length}; NOT held-out once used as keywords): ${score(FAQ.map(x => [x.en, x.gold_kb_ids]))}`);
