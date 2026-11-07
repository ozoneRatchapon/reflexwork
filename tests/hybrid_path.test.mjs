// Advice answers that ask the AI to tidy the manual text (QA F30/F61): the manual text shows at once under the official badge, the
// AI badge only appears when an AI answer really replaced it, and the page stops waiting soon after the proxy does.
// Run: node tests/hybrid_path.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const proxy = readFileSync(join(root, 'integrations/llm-proxy/worker.mjs'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const i = html.indexOf("const mid='hyb'+(++fbN);"), br = html.slice(i, html.indexOf('paintBar();', i));
const first = br.slice(br.indexOf("add('b', `"), br.indexOf('${fbUI(q'));
const routeAt = (first.match(/<span class="route[^"]*"[^>]*>([^<]*)</) || [])[1] || '';
check('F30: the first route chip does not claim AI wording (badge regex: "AI ช่วยเรียบเรียง")', !/AI ช่วยเรียบเรียง/.test(routeAt) && /ตอบจากคู่มือ/.test(routeAt), routeAt);
check('F61: the manual text is in the answer at once (no skeleton-only wait)', /<div class="ans" id="\$\{mid\}">\$\{kbBody\(hit, q\)\}<\/div>/.test(first) && !/class="skel"/.test(first));
check('F61: the waiting note is student-visible (not .meta, which moves to the evidence panel)', /class="hyb-wait" id="\$\{mid\}w"/.test(first) && /\.meta, /.test(html.match(/const EV_SEL = '[^']*'/)[0]) && !/hyb-wait/.test(html.match(/const EV_SEL = '[^']*'/)[0]));
check('F30: no AI answer -> chip and meta say the AI did not tidy it, the badge stays official', /if\(!ans\)\{[\s\S]*?AI ไม่ได้เรียบเรียง[\s\S]*?AI เรียบเรียงไม่สำเร็จ[\s\S]*?return;\s*\}/.test(br) && !/if\(!ans\)\{[^}]*src-badge/.test(br));
check('F30: an AI answer switches the badge to AI', /b\.className='src-badge ai'; b\.textContent='🤖 AI ช่วยเรียบเรียง จากข้อมูลทางการ'/.test(br));
const pageMs = +(html.match(/timer = setTimeout\(\(\)=>ac\.abort\(\), (\d+)\);/) || [])[1];
const proxyMs = +(proxy.match(/Number\(env\.LLM_BUDGET_MS\) \|\| (\d+)/) || [])[1];
check(`F61: the page gives up within 3 s of the proxy budget (page ${pageMs} ms, proxy ${proxyMs} ms)`, pageMs > proxyMs && pageMs - proxyMs <= 3000);
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
