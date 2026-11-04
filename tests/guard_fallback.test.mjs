// The grounded-answer guard never hands the student its own apology as an AI answer (QA F59), and a scraped "no plan found"
// placeholder is not printed as a plan under "now open" (QA F41).   Run: node tests/guard_fallback.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const guardOf = src => { const i = src.indexOf('function groundedGuard('); return new Function(src.slice(i, src.indexOf('\n}\n', i) + 2) + ';return groundedGuard;')(); };
for (const f of ['integrations/llm-proxy/worker.mjs', 'integrations/llm-proxy/local-llm-proxy.mjs']) {
  const src = read(f), g = guardOf(src);
  check(`${f}: an answer with only invented facts becomes '' (not an apology)`, g('ยื่นภายใน 99 วัน', 'ยื่นภายใน 30 วัน') === '', JSON.stringify(g('ยื่นภายใน 99 วัน', 'ยื่นภายใน 30 วัน')));
  check(`${f}: grounded lines are kept, invented ones dropped`, g('ยื่นภายใน 30 วัน\nได้ 99 วัน', 'ยื่นภายใน 30 วัน') === 'ยื่นภายใน 30 วัน');
  check(`${f}: the guard returns no apology string`, !/'คู่มือมีข้อมูลไม่พอ/.test(src));
}
const w = read('integrations/llm-proxy/worker.mjs');
check('worker: both grounded paths turn an emptied answer into source:fallback', (w.match(/if \(!o?text\) return new Response\(JSON\.stringify\(\{ answer: '', source: 'fallback', detail: \['guard-emptied'\] \}\)/g) || []).length === 2);
check('local proxy: an emptied answer is source:fallback', /answer \? \{ answer, source: 'ollama-local'[^}]*\} : \{ answer: '', source: 'fallback'/.test(read('integrations/llm-proxy/local-llm-proxy.mjs')));
const page = read('submissions/ui/chatbot.html');
check('the page treats source:fallback as no AI answer', /j\.source!=='fallback'\) \? j\.answer\.trim\(\) : ''/.test(page));
check('F41: the plan list drops the scraper placeholder', /const plans=\(S\['แผนการศึกษาที่เปิดรับสมัคร'\]\|\|\[\]\)\.filter\(p=>!\/\^ไม่พบแผนการศึกษา\/\.test/.test(page));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
