// What leaves the page: the gap log gets one scrubbed copy per unanswered question, and ?api= / ?llm= cannot point the chat at a stranger's server.
// Run: node tests/privacy.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log((ok ? '✓' : '✗') + ' ' + n + (ok ? '' : `  ← ${d}`)); ok ? pass++ : fail++; };
const sm = html.match(/function scrubForLog\(q\)\{[^\n]*\}\n/), bm = html.match(/const _BACKEND_OK=[\s\S]*?\nfunction safeBackend\(v\)\{[\s\S]*?catch\(_\)\{ return ''; \} \}\n/);
check('scrubForLog and safeBackend found', sm && bm); if (!sm || !bm) process.exit(1);
// The page's scrubber calls the shipped Rust mask (reflex-wasm `pii`): run it against the same wasm file the page loads.
const WASM = await import(pathToFileURL(join(root, 'submissions/ui/wasm/reflex_wasm.js')).href);
WASM.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });
const scrub = new Function('WASM', sm[0] + '\nreturn scrubForLog;')(WASM);
const safeBackend = new Function('location', bm[0] + '\nreturn safeBackend;')({ href: 'https://reflexwork.pages.dev/chatbot.html', origin: 'https://reflexwork.pages.dev' });
const s1 = scrub('ระบบล่ม ผมชื่อ สมชาย ใจดี รหัส 6537001 somchai@mahidol.ac.th โทร 081-234-5678');
check('email, id, phone and a stated name are masked', !/somchai|6537001|234|สมชาย/.test(s1), s1);
check('ordinary questions keep their meaning', scrub('ค่าสมัคร 500 บาท ภาคต้น 2570') === 'ค่าสมัคร 500 บาท ภาคต้น 2570', scrub('ค่าสมัคร 500 บาท ภาคต้น 2570'));
check('long text is cut to 500 characters', scrub('ก'.repeat(900)).length === 500);
const s2 = scrub('เลขบัตร 1-2345-67890-12-3 โทร +66 81 234 5678 line id: somchai_88 นางสาวสมหญิง ใจดี');
check('national id, +66 phone, LINE id and a titled name are masked', !/2345|234 5678|somchai|สมหญิง/.test(s2), s2);
check('a role that starts with a title is kept', scrub('ติดต่อนายทะเบียนที่ไหน') === 'ติดต่อนายทะเบียนที่ไหน');
// Every copy of the question that leaves the page is scrubbed: the AI proxy (/rewrite, /llm), the vote and the gap list.
const rawSends = (html.match(/input:q\b|\{ *q:q\b/g) || []).length;
check('no request body carries the raw question', rawSends === 0, `${rawSends} raw`);
check('the AI proxy and the vote get the scrubbed copy', (html.match(/input:scrubForLog\(q\)/g) || []).length === 3);
check('shipped workers and loopback are accepted', ['https://reflexwork-kernel.solana-thailand.workers.dev', 'http://127.0.0.1:8793', 'http://localhost:9'].every(u => safeBackend(u)));
check('a stranger\'s origin, protocol-relative and junk are refused', ['https://evil.example', '//evil.example', 'https://reflexwork-kernel.solana-thailand.workers.dev.evil.example', 'javascript:alert(1)', ''].every(u => safeBackend(u) === ''));
const raw = (html.match(/\+'\/gap',\{method:'POST'/g) || []).length;
check('no inline /gap POST bypasses logGap (so no double count, no unscrubbed copy)', raw === 0, `${raw} inline`);
// The intake branch (a personal/technical issue) runs from take('intake') to its else; the gap log is only in the else.
const intakeA = html.indexOf("if(take('intake')){"), intakeB = html.indexOf('} else {\n    logGap(q);', intakeA);
check('intake branch found (anchors for the next check)', intakeA > 0 && intakeB > intakeA, `${intakeA} ${intakeB}`);
check('intake messages are not logged', intakeA > 0 && intakeB > intakeA && !/logGap/.test(html.slice(intakeA, intakeB)));
const note = (html.match(/<div class="privacy-note"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
check('the privacy note says the AI is an outside service that may be abroad, and how to switch it off', /บริการ AI ภายนอก/.test(note) && /นอกประเทศไทย/.test(note) && /\?ai=off/.test(note), note.slice(0, 120));
check('the privacy note does not promise a complete mask', /ซ่อนได้ไม่หมด/.test(note));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
