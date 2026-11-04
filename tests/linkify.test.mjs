// Clickable links inside answers (submissions/ui/chatbot.html <linkify> + submissions/ui/system-links.json).
// Run: node tests/linkify.test.mjs            (exit 0 = pass, 1 = fail)
//      node tests/linkify.test.mjs --online   also fetches every registry URL once (read-only GET) to catch link rot
//
// The property that matters: linkify() takes PLAIN TEXT and returns HTML in which (a) nothing the text said is lost or
// changed, (b) no markup from the text survives, (c) every href is http(s) on an allowlisted host.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const bm = html.match(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/);
check('linkify block found in chatbot.html', bm);
if (!bm) process.exit(1);
const { linkify } = new Function(bm[1] + '\nreturn {linkify};')();
const reg = JSON.parse(readFileSync(join(root, 'submissions/ui/system-links.json'), 'utf8')), LINKS = reg.links;

const hrefs = h => [...h.matchAll(/<a class="inl" href="([^"]*)"/g)].map(m => m[1]);
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = h => unesc(h.replace(/<[^>]+>/g, ''));
const HOST = /^(?:[a-z0-9-]+\.)*(?:mahidol\.ac\.th|line\.me|canva\.site)$/i;

// --- behaviour ------------------------------------------------------------------------------------------------------
{ const h = linkify('ดูที่ https://graduate.mahidol.ac.th/thai/current-students/?g=17&t=6. แล้วกลับมา', LINKS);
  check('bare URL is linked and the sentence-final "." is not part of it', hrefs(h)[0] === 'https://graduate.mahidol.ac.th/thai/current-students/?g=17&t=6' || hrefs(h)[0] === 'https://graduate.mahidol.ac.th/thai/current-students/?g=17&amp;t=6', h); }
{ const h = linkify('ไปที่ https://evil.example/login และ javascript:alert(1) และ http://mahidol.ac.th.evil.example/x', LINKS);
  check('off-allowlist hosts and javascript: are never linked (incl. look-alike hosts)', hrefs(h).length === 0, h); }
{ const h = linkify('<script>alert(1)</script> <img src=x onerror=alert(2)> "quoted" & \'single\'', LINKS);
  check('markup in the text is escaped, nothing survives as a tag', !/<(script|img)/i.test(h) && plain(h) === '<script>alert(1)</script> <img src=x onerror=alert(2)> "quoted" & \'single\'', h); }
{ const h = linkify('ติดต่อ LINE ID @160ohrzm หรือ @160ohrzm อีกครั้ง', LINKS);
  check('LINE id becomes a link once (first mention)', hrefs(h).length === 1 && hrefs(h)[0] === 'https://line.me/R/ti/p/@160ohrzm', h); }
{ const h = linkify('ส่งอีเมลถึง somebody@mahidol.ac.th หรือ name.surname@student.mahidol.ac.th', LINKS);
  check('e-mail addresses are not mistaken for LINE ids', hrefs(h).length === 0, h); }
{ const h = linkify('ส่งผ่านระบบ e-Thesis ก่อน แล้วตรวจ e-Thesis อีกรอบ', LINKS);
  check('registry phrase links on its first mention only', hrefs(h).length === 1 && /ethesis\/stu\/login\.php/.test(hrefs(h)[0]), h); }
{ const u = 'https://graduate.mahidol.ac.th/ethesis/stu/login.php', h = linkify('เข้าที่ ' + u + ' ได้เลย', LINKS);
  check('a URL that contains a registry phrase is linked once, not nested', hrefs(h).length === 1 && (h.match(/<a /g) || []).length === 1, h); }
{ const h = linkify('สมัครผ่านระบบ Online Admission', LINKS);
  check('"สมัครผ่านระบบ Online Admission" links the system name to the official apply page', hrefs(h)[0] === 'https://graduate.mahidol.ac.th/admission-apply/' && /<a [^>]*>Online Admission<\/a>/.test(h), h); }
{ const h = linkify('ตั้งรหัสใหม่ที่ account.mahidol.ac.th (กด Forgot password) หรือส่งถึง somebody@student.mahidol.ac.th', LINKS);
  check('a host written without https:// is linked; an e-mail domain is not', hrefs(h).length === 1 && hrefs(h)[0] === 'https://account.mahidol.ac.th' && /<a [^>]*>account\.mahidol\.ac\.th<\/a>/.test(h), h); }
{ const h = linkify('ดู https://graduate.mahidol.ac.th/x และ evilmahidol.ac.th.example.com/y และ notmahidol.ac.th', LINKS);
  check('look-alike hosts written without a scheme are not linked', hrefs(h).length === 1, h); }
check('no registry -> bare URLs and LINE ids still work', hrefs(linkify('https://muce.mahidol.ac.th/ และ @610punyj', [])).length === 2);
check('empty / null input is safe', linkify('', LINKS) === '' && linkify(null, LINKS) === '' && linkify(undefined) === '');
{ const bad = [{ id: 'x', match: 'ทดสอบ', url: 'javascript:alert(1)' }, { id: 'y', match: '(', url: 'https://muce.mahidol.ac.th/' }, { id: 'z', match: 'ทดสอบ', url: 'https://evil.example/' }];
  check('a registry entry with a bad url / bad regex / foreign host is ignored, not trusted', hrefs(linkify('ทดสอบ (', bad)).length === 0); }

// --- the registry -----------------------------------------------------------------------------------------------------
check('registry has entries, unique ids, a label and the official page each URL was read from',
  LINKS.length >= 8 && new Set(LINKS.map(l => l.id)).size === LINKS.length && LINKS.every(l => l.id && l.label && /^https:\/\/graduate\.mahidol\.ac\.th\//.test(l.seen_on)));
check('every registry URL is https on an allowlisted host', LINKS.every(l => { try { const u = new URL(l.url); return u.protocol === 'https:' && HOST.test(u.hostname); } catch { return false; } }), LINKS.filter(l => !/^https:/.test(l.url)).map(l => l.id).join());
check('every registry pattern compiles and does not match the empty string', LINKS.every(l => { try { return !new RegExp(l.match, 'i').test(''); } catch { return false; } }));

// --- against the real knowledge base ------------------------------------------------------------------------------------
const kbPath = join(root, 'submissions/ui/knowledge-index.json');
if (!existsSync(kbPath)) check('knowledge-index.json present (python3 submissions/build_knowledge_index.py)', false);
else {
  const KB = JSON.parse(readFileSync(kbPath, 'utf8'));
  const out = KB.map(e => ({ e, h: linkify(e.answer, LINKS) }));
  check(`text is preserved byte-for-byte after linking (${KB.length} KB answers)`, out.every(({ e, h }) => plain(h) === e.answer), out.filter(({ e, h }) => plain(h) !== e.answer).map(x => x.e.id).slice(0, 5).join());
  check('every href in every answer is http(s) on an allowlisted host', out.every(({ h }) => hrefs(h).every(u => { try { const x = new URL(unesc(u)); return /^https?:$/.test(x.protocol) && HOST.test(x.hostname); } catch { return false; } })));
  const urlsIn = e => (e.answer.match(/https?:\/\/[^\s<>"'`]+/g) || []).map(u => u.replace(/[.,;:!?)\]}、。]+$/, ''));
  const missed = out.flatMap(({ e, h }) => urlsIn(e).filter(u => HOST.test(new URL(u).hostname) && !hrefs(h).map(unesc).includes(u)).map(u => `${e.id}: ${u}`));
  check('every allowlisted URL already written in an answer is clickable', missed.length === 0, missed.slice(0, 4).join(' | '));
  const dead = LINKS.filter(l => !KB.some(e => new RegExp(l.match, 'i').test(e.answer.replace(/https?:\/\/\S+/g, ''))));
  check('no dead registry entry (each fires on at least one KB answer)', dead.length === 0, dead.map(l => l.id).join());
  const linked = out.filter(({ h }) => hrefs(h).length).length;
  const sys = KB.flatMap(e => [...e.answer.replace(/https?:\/\/\S+/g, '').matchAll(/ระบบ\s?([A-Za-z][A-Za-z0-9+\- ]{2,24}[A-Za-z0-9+])/g)].map(m => m[1].trim())).filter(n => !LINKS.some(l => new RegExp(l.match, 'i').test(n)));
  console.log(`  ${linked}/${KB.length} KB answers now carry at least one link; named systems with NO official link on record (left as plain text): ${[...new Set(sys)].join(', ') || '-'}`);
}

// --- link rot (opt-in, network) -------------------------------------------------------------------------------------------
if (process.argv.includes('--online')) {
  const bad = [];
  for (const l of LINKS) {
    try { const r = await fetch(l.url, { redirect: 'follow', headers: { 'User-Agent': 'ReflexWork-linkcheck/1 (read-only)' }, signal: AbortSignal.timeout(20000) }); if (r.status >= 400) bad.push(`${l.id} ${r.status}`); }
    catch (e) { bad.push(`${l.id} ${e.cause?.code || e.message}`); }
  }
  check(`all ${LINKS.length} registry URLs answer (no 4xx/5xx)`, bad.length === 0, bad.join(' | '));
}

// QA F40: a registry name inside a LINE id / URL / longer word is not linked; the LINE id itself is, and a free-standing name still is
{ const kb = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
  const e = kb.find(x => x.id === 'gm_admissions_office_contacts'), h = linkify(e ? e.answer : '', LINKS);
  check('F40: @mugradmissions stays one LINE link (no MU GRAD link inside it)', !!e && /<a [^>]*href="https:\/\/line\.me\/R\/ti\/p\/@mugradmissions"[^>]*>@mugradmissions<\/a>/.test(h) && !/@<a /.test(h), h.slice(0, 200));
  const h2 = linkify('ติดต่อ LINE @mugradmissions หรือสมัครผ่าน MU GRAD', LINKS);
  check('F40: the later free-standing MU GRAD is still linked', /MUGRADRegister[^>]*>MU GRAD<\/a>/.test(h2), h2); }
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
