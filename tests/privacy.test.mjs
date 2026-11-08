// What leaves the page: the gap log gets one scrubbed copy per unanswered question, and ?api= / ?llm= cannot point the chat at a stranger's server.
// Run: node tests/privacy.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const sm = html.match(/function scrubForLog\(q\)\{[^\n]*\}\n/), bm = html.match(/const _BACKEND_OK=[\s\S]*?\nfunction safeBackend\(v\)\{[\s\S]*?catch\(_\)\{ return ''; \} \}\n/);
check('scrubForLog and safeBackend found', sm && bm); if (!sm || !bm) process.exit(1);
const scrub = new Function(sm[0] + '\nreturn scrubForLog;')();
const safeBackend = new Function('location', bm[0] + '\nreturn safeBackend;')({ href: 'https://reflexwork.pages.dev/chatbot.html', origin: 'https://reflexwork.pages.dev' });
const s1 = scrub('ระบบล่ม ผมชื่อ สมชาย ใจดี รหัส 6537001 somchai@mahidol.ac.th โทร 081-234-5678');
check('email, id, phone and a stated name are masked', !/somchai|6537001|234|สมชาย/.test(s1), s1);
check('ordinary questions keep their meaning', scrub('ค่าสมัคร 500 บาท ภาคต้น 2570') === 'ค่าสมัคร 500 บาท ภาคต้น 2570', scrub('ค่าสมัคร 500 บาท ภาคต้น 2570'));
check('long text is cut to 500 characters', scrub('ก'.repeat(900)).length === 500);
check('shipped workers and loopback are accepted', ['https://reflexwork-kernel.solana-thailand.workers.dev', 'http://127.0.0.1:8793', 'http://localhost:9'].every(u => safeBackend(u)));
check('a stranger\'s origin, protocol-relative and junk are refused', ['https://evil.example', '//evil.example', 'https://reflexwork-kernel.solana-thailand.workers.dev.evil.example', 'javascript:alert(1)', ''].every(u => safeBackend(u) === ''));
const raw = (html.match(/\+'\/gap',\{method:'POST'/g) || []).length;
check('no inline /gap POST bypasses logGap (so no double count, no unscrubbed copy)', raw === 0, `${raw} inline`);
// The intake branch (a personal/technical issue) runs from take('intake') to its else; the gap log is only in the else.
const intakeA = html.indexOf("if(take('intake')){"), intakeB = html.indexOf('} else {\n    logGap(q);', intakeA);
check('intake branch found (anchors for the next check)', intakeA > 0 && intakeB > intakeA, `${intakeA} ${intakeB}`);
check('intake messages are not logged', intakeA > 0 && intakeB > intakeA && !/logGap/.test(html.slice(intakeA, intakeB)));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
