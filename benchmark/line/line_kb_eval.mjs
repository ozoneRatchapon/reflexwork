// LINE bot retrieval on the official FAQ (benchmark/field/faq_questions.json, Thai, student items): which entry the LINE worker answers
// with. Since plan 009 C4 LINE decides with the shared Rust Router (decideLine), built from its KB copy (integrations/line-worker/kb-data.mjs).
// Offline, no LINE/kernel calls.
//   node benchmark/line/line_kb_eval.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { root } from '../../scripts/lib/chatbot_fns.mjs';
register('../../tests/lib/wasm_module_hook.mjs', import.meta.url);
const { decideLine } = await import('../../integrations/line-worker/worker.mjs');
const { KB } = await import('../../integrations/line-worker/kb-data.mjs');
const FAQ = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8')).items.filter(i => i.student && i.th);
const ids = new Set(KB.map(e => e.id));
const ANSWERS = new Set(['kb_act', 'advice_strong', 'advice_hybrid']), ASKS = new Set(['disambiguate', 'scope_ask', 'topic_picks', 'time_intent']);
const c = { right: 0, wrong: 0, asked_gold: 0, asked_no_gold: 0, other: 0, unc_answered: 0, unc_other: 0 };
let covered = 0;
for (const it of FAQ) {
  const gold = it.gold_kb_ids.filter(g => ids.has(g)), d = decideLine(it.th);
  if (!gold.length) { ANSWERS.has(d.route) ? c.unc_answered++ : c.unc_other++; continue; }
  covered++;
  if (ANSWERS.has(d.route)) gold.includes(d.entry) ? c.right++ : c.wrong++;
  else if (ASKS.has(d.route)) (d.offered || []).some(x => gold.includes(x)) ? c.asked_gold++ : c.asked_no_gold++;
  else c.other++;
}
console.log(`KB ${KB.length} entries · student FAQ ${FAQ.length} (covered by this KB: ${covered})`);
console.log(`covered: right ${c.right} · wrong ${c.wrong} · asks (gold offered) ${c.asked_gold} · asks (gold not offered) ${c.asked_no_gold} · other route (not found / hand-off) ${c.other}`);
console.log(`not covered (${FAQ.length - covered}): answered anyway ${c.unc_answered} · asked/handed off ${c.unc_other}`);
