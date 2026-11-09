// How often does the answer-type note appear on the 387-question test pool (top-1 entry that the bot would answer with)? Read-only.
// Run: node benchmark/rules/note_rate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pageSearch, pageDecideTier } from '../../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const search = pageSearch(KB, html);
const decide = pageDecideTier(html);
const { missingTypes } = new Function('isEnglish', '_lEsc', html.match(/\/\/ <answer-type>[\s\S]*?\/\/ <\/answer-type>/)[0] + '\nreturn {missingTypes};')(() => false, s => s);
const faq = JSON.parse(R('benchmark/field/faq_questions.json')).items;
const SETS = { faq_th: faq.map(x => x.th), faq_en: faq.map(x => x.en), odd: JSON.parse(R('benchmark/odd/odd_questions.json')).items.map(x => x.q),
  en_heldout: JSON.parse(R('benchmark/field/english_heldout.json')).items.map(x => x[0]), beginner: R('benchmark/coverage/beginner_questions.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')),
  eval52: [...R('tests/kb_search.test.mjs').matchAll(/^\s*\['([^']+)',\s*(?:null|'[^']*'),\s*'[^']*'\],?$/gm)].map(m => m[1]) };
let act = 0, noted = 0; const ex = [];
for (const [k, qs] of Object.entries(SETS)) for (const q of qs) { const r = search(q); if (decide({ gate: 0.061, ranked: r }).action !== 'act') continue; act++;
  if (missingTypes(q, r[0].e).length) { noted++; if (ex.length < 8) ex.push(`${k}: ${q.slice(0, 55)}  -> ${r[0].e.id}`); } }
console.log(`answered (act): ${act}; with the answer-type note: ${noted} (${(100 * noted / act).toFixed(1)}%)\n` + ex.join('\n'));
