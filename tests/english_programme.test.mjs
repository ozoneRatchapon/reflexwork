// English questions about a named programme reach its card (QA F54 items 3-4), and no English KB / field question is pulled to a
// programme card by it.   Run: node tests/english_programme.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadChatbotFns } from '../scripts/lib/chatbot_fns.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), read = f => readFileSync(join(root, f), 'utf8');
const h = read('submissions/ui/chatbot.html'), F = loadChatbotFns(), P = JSON.parse(read('submissions/ui/programmes.json')).programmes;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const isEnglish = (await import('../integrations/_shared/intake.mjs')).isEnglish;   // the page's copy is the wasm port now (plan 015 step 2)
const ea = new Function('isEnglish', h.slice(h.indexOf('const _P_EN_ASK='), h.indexOf('function isLevelOnlyQuestion(q){')) + 'return englishProgrammeAsk;')(isEnglish);
const via = q => { const r0 = F.resolveProgramme(q, P); if (r0) return r0; const a = ea(q); if (!a) return null; const r = F.resolveProgramme(a.name, P); return r && r.kind === 'one' ? { ...r, topic: r.topic || a.topic } : null; };
const cases = [['interview date for clinical psychology', 'schedule'], ['when is the interview for MSc Clinical Psychology', 'schedule'], ['is clinical psychology open for application', 'status']];
for (const [q, topic] of cases) { const r = via(q); check(`F54: "${q}" -> one programme, topic ${topic}`, r && r.kind === 'one' && /CLINICAL PSYCHOLOGY|จิตวิทยาคลินิก/i.test(r.row.title + ' ' + (r.row.title_en || '')) && r.topic === topic, JSON.stringify(r && { kind: r.kind, t: r.row && r.row.title, topic: r.topic })); }
const faq = JSON.parse(read('benchmark/field/faq_questions.json')).items.map(i => i.en).filter(Boolean);
const pulled = faq.filter(q => !F.resolveProgramme(q, P) && via(q));
check(`F54: none of ${faq.length} English field questions is pulled to a programme card`, pulled.length === 0, pulled.slice(0, 3).join(' | '));
check('F54: the pre-pass only runs when the resolver found nothing, and only accepts one programme', /if\(!prog && !pinned && !staffFirst && PROG\.length\)\{ const ea=englishProgrammeAsk\(q\);[\s\S]*?if\(r && r\.kind==='one'\) prog=/.test(h));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
