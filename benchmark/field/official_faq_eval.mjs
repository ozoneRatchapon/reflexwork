// Field evaluation on the OFFICIAL Graduate School FAQ (115 items: Thai page + the school's own English wording). The questions come from the
// school, not from us. Offline: it runs the page's own search() and decideTier() (extracted from submissions/ui/chatbot.html), so it measures
// exactly what the page does on the knowledge-base path (it does not exercise the programme resolver or the AI rephrase).
//   node benchmark/field/official_faq_eval.mjs [--no-write]
// Ground truth: benchmark/field/faq_questions.json (gold_kb_ids per FAQ item; see its 'labeling' note). Labeled by the assistant, to be
// confirmed by the KB owner. IMPORTANT: 62 of our KB entries were compiled from this same FAQ, so the "school wording" rows measure routing
// fidelity, not generalisation; the English wording (translated by the school), shortened, typo and mixed rows are the closer checks.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAQ = JSON.parse(readFileSync(join(root, 'benchmark/field/faq_questions.json'), 'utf8'));
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const twin = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;');
const search = new Function('KB', twin)(KB);
const decide = new Function(html.match(/const _BAND=[\s\S]*?\nfunction decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/)[0] + '\nreturn decideTier;')();
const GATE = 0.061;
const rows = FAQ.items.map(it => ({ ...it, gold: new Set(it.gold_kb_ids) }));
const covered = rows.filter(r => r.student && r.gold.size), uncoveredStudent = rows.filter(r => r.student && !r.gold.size), staffOnly = rows.filter(r => !r.student);
const p = (k, n) => `${k}/${n} (${Math.round(100 * k / n)}%)`;
// deterministic perturbations
const dropEnd = q => q.replace(/(ได้ไหม|ได้หรือไม่|อย่างไร|ยังไง|หรือไม่|ครับ|ค่ะ|คะ)\s*\??\s*$/, '').trim();
const shorten = q => q.split(/\s+/).slice(0, 6).join(' ');
const typo = q => { const c = [...q]; let n = 0; for (let i = 2; i < c.length - 1 && n < 2; i += 7) { if (/[ก-ฮ]/.test(c[i])) { c.splice(i, 1); n++; } } return c.join(''); };   // drop two consonants
const mixed = q => q.replace(/ค่าธรรมเนียม/g, 'fee').replace(/วิทยานิพนธ์/g, 'thesis').replace(/สมัคร/g, 'apply');
function run(label, qOf, set) {
  let top1 = 0, top3 = 0, act = 0, right = 0, wrong = 0, asked = 0, handed = 0;
  for (const r of set) {
    const ranked = search(qOf(r)), v = decide({ gate: GATE, ranked }), ids = ranked.slice(0, 3).map(x => x.e.id);
    if (r.gold.has(ids[0])) top1++; if (ids.some(x => r.gold.has(x))) top3++;
    if (v.action === 'act') { act++; r.gold.has(v.entry.id) ? right++ : wrong++; } else if (v.action === 'disambiguate') asked++; else handed++;
  }
  const n = set.length; return { label, n, top1: p(top1, n), top3: p(top3, n), answered: p(act, n), right: p(right, n), wrong: p(wrong, n), asked: p(asked, n), handed: p(handed, n) };
}
const cover = [run('Thai, school wording', r => r.th, covered), run('English, school wording (translated by the school)', r => r.en, covered), run('Thai shortened to 6 words', r => shorten(r.th), covered),
  run('Thai without the ending words', r => dropEnd(r.th), covered), run('Thai with 2 dropped letters (typo)', r => typo(r.th), covered), run('Thai/English mixed', r => mixed(r.th), covered)];
const offRate = (label, set, qOf) => { let ans = 0, ask = 0, hand = 0; for (const r of set) { const v = decide({ gate: GATE, ranked: search(qOf(r)) }); v.action === 'act' ? ans++ : v.action === 'disambiguate' ? ask++ : hand++; } const n = set.length; return { label, n, ans: p(ans, n), ask: `${ask}/${n}`, hand: p(hand, n) }; };
const off = [offRate('student FAQ items NOT in the KB — Thai', uncoveredStudent, r => r.th), offRate('student FAQ items NOT in the KB — English', uncoveredStudent, r => r.en),
  offRate('staff-only FAQ items (out of scope) — Thai', staffOnly, r => r.th), offRate('staff-only FAQ items (out of scope) — English', staffOnly, r => r.en)];
const cat = {}; for (const r of rows.filter(r => r.student)) { const c = (cat[r.category] ??= [0, 0]); c[0]++; if (r.gold.size) c[1]++; }
const md = [`# Official FAQ field evaluation — ${new Date().toISOString().slice(0, 10)}`, '',
  `Source: ${FAQ.source}. ${rows.length} items: ${rows.filter(r => r.student).length} for applicants/students, ${staffOnly.length} staff-only (out of scope). KB entries: ${KB.length}.`,
  `Gold: ${FAQ.labeling}`, '',
  `Covered student items: **${covered.length}**; student items not in the KB: **${uncoveredStudent.length}**.`, '',
  'IMPORTANT: 62 of our KB entries were compiled from this same FAQ, so the "school wording" rows measure routing fidelity, not generalisation. The English wording, shortened, typo and mixed rows are the closer-to-generalisation checks.', '',
  '## Questions we cover', '', '| question set | n | top-1 | top-3 | answered | answered right | answered wrong | asked which | handed on |', '|---|---|---|---|---|---|---|---|---|',
  ...cover.map(o => `| ${o.label} | ${o.n} | ${o.top1} | ${o.top3} | ${o.answered} | ${o.right} | ${o.wrong} | ${o.asked} | ${o.handed} |`), '',
  '## Questions we do NOT cover (right behaviour = do not answer with an unrelated entry)', '', '| question set | n | answered anyway | asked which | handed on |', '|---|---|---|---|---|',
  ...off.map(o => `| ${o.label} | ${o.n} | ${o.ans} | ${o.ask} | ${o.hand} |`), '',
  '## Coverage of the official FAQ by topic (student-facing items)', '', '| category | items | covered by our KB |', '|---|---|---|', ...Object.entries(cat).map(([c, [a, b]]) => `| ${c} | ${a} | ${b} |`), '',
  '## Student-facing FAQ items our KB does not cover (candidates for the KB owners)', '', ...uncoveredStudent.map(r => `- FAQ ${r.id} [${r.category}] ${r.th}`), ''].join('\n');
console.log(md.split('\n').slice(0, 34).join('\n'));
if (!process.argv.includes('--no-write')) {
  const dir = join(root, 'benchmark/field/results'); mkdirSync(dir, { recursive: true });
  const next = String(Math.max(0, ...readdirSync(dir).map(f => parseInt(f, 10)).filter(Number.isFinite)) + 1).padStart(3, '0');
  const f = join(dir, `${next}_${new Date().toISOString().slice(0, 10)}.md`); writeFileSync(f, md + '\n'); console.log('\nwrote', f);
}
