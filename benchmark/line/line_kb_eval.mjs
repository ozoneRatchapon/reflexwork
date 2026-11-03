// LINE bot retrieval on the official FAQ (benchmark/field/faq_questions.json, Thai, student items): which entry LINE's own
// pickFromKB() answers with, for a given KB copy. Offline, no LINE/kernel calls.
//   node benchmark/line/line_kb_eval.mjs <kb-data.mjs> [gate=0.5]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pickFromKB } from '../../integrations/line-worker/worker.mjs';
import { root } from '../../scripts/lib/chatbot_fns.mjs';
const kbFile = resolve(process.argv[2] || join(root, 'integrations/line-worker/kb-data.mjs')), gate = Number(process.argv[3] ?? 0.5);
const { KB } = await import(kbFile);
const FAQ = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items.filter(i => i.student && i.th);
const ids = new Set(KB.map(e => e.id));
const c = { right: 0, wrong: 0, asked_gold: 0, asked_no_gold: 0, escalate: 0, unc_answered: 0, unc_other: 0 };
let covered = 0;
for (const it of FAQ) {
  const gold = it.gold_kb_ids.filter(g => ids.has(g)), p = pickFromKB(it.th, gate, KB);
  if (!gold.length) { p.tier === 'confident' ? c.unc_answered++ : c.unc_other++; continue; }
  covered++;
  if (p.tier === 'confident') gold.includes(p.entry.id) ? c.right++ : c.wrong++;
  else if (p.tier === 'ambiguous') (p.candidates || []).some(x => gold.includes(x.id)) ? c.asked_gold++ : c.asked_no_gold++;
  else c.escalate++;
}
console.log(`KB ${KB.length} entries · gate ${gate} · student FAQ ${FAQ.length} (covered by this KB: ${covered})`);
console.log(`covered: right ${c.right} · wrong ${c.wrong} · asks (gold offered) ${c.asked_gold} · asks (gold not offered) ${c.asked_no_gold} · escalate ${c.escalate}`);
console.log(`not covered (${FAQ.length - covered}): answered anyway ${c.unc_answered} · asked/escalated ${c.unc_other}`);
