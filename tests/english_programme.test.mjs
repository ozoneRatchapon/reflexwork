// English questions about a named programme reach its card (QA F54 items 3-4), and no English KB / field question is pulled to a
// programme card by it.   Run: node tests/english_programme.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shippedWasm } from '../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), read = f => readFileSync(join(root, f), 'utf8');
const h = read('submissions/ui/chatbot.html'), F = new Function('WASM', ['linkify', 'programme-resolve'].map(n => h.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1]).join('') + '\nreturn { resolveProgramme };')(shippedWasm()), P = JSON.parse(read('submissions/ui/programmes.json')).programmes;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
// the English pre-pass is Rust's since plan 015 step 4c (route/programme.rs `programme_match`): the router's programme route and its match
const { decisionOf, catalogue } = await import('../scripts/lib/rust_route.mjs');
const byCode = new Map(catalogue.PROG.map(p => [p.code, p]));
const via = q => { const d = decisionOf(q); const r = d.programme; return d.route === 'programme_card' && r ? { kind: r.kind, row: byCode.get(r.codes[0]), topic: r.topic } : d.route === 'programme_pick' && r ? { kind: r.kind } : null; };
const cases = [['interview date for clinical psychology', 'schedule'], ['when is the interview for MSc Clinical Psychology', 'schedule'], ['is clinical psychology open for application', 'status']];
for (const [q, topic] of cases) { const r = via(q); check(`F54: "${q}" -> one programme, topic ${topic}`, r && r.kind === 'one' && /CLINICAL PSYCHOLOGY|จิตวิทยาคลินิก/i.test(r.row.title + ' ' + (r.row.title_en || '')) && r.topic === topic, JSON.stringify(r && { kind: r.kind, t: r.row && r.row.title, topic: r.topic })); }
const faq = JSON.parse(read('benchmark/field/faq_questions.json')).items.map(i => i.en).filter(Boolean);
const pulled = faq.filter(q => !F.resolveProgramme(q, P) && via(q));
check(`F54: none of ${faq.length} English field questions is pulled to a programme card`, pulled.length === 0, pulled.slice(0, 3).join(' | '));
check('F54: the page renders the router\'s match (no page copy of the pre-pass)', /const prog = _progView\(RUST_DETAIL\.programme, false\)/.test(h) && !/englishProgrammeAsk/.test(h));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
