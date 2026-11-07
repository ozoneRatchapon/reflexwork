// "Another organisation can use it": builds the example pack into a temp folder with scripts/new_agency.mjs and checks the result is self-contained,
// and that the Graduate School's words/links live ONLY in the places meant for them (DEFAULT_AGENCY, the programme resolver, the built-in fallback KB,
// and three static defaults that agency.json replaces at start-up). The live behaviour is proven by scripts/adoption_smoke.mjs (needs Chrome).
// Run: node tests/agency_pack.test.mjs
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const out = join(mkdtempSync(join(tmpdir(), 'rw-pack-')), 'site');
let log = ''; try { log = execFileSync('node', [join(root, 'scripts/new_agency.mjs'), join(root, 'examples/library-demo'), out], { encoding: 'utf8' }); } catch (e) { log = String(e.stdout || '') + String(e.stderr || ''); }
check('the pack builder runs on the example pack', /ready:/.test(log), log.slice(0, 200));
const entries = existsSync(join(out, 'knowledge-index.json')) ? JSON.parse(readFileSync(join(out, 'knowledge-index.json'), 'utf8')) : [];
const packEntries = readdirSync(join(root, 'examples/library-demo/knowledge')).filter(f => f.endsWith('.md')).length;
check(`the index has the pack's ${packEntries} entries and nothing else`, entries.length === packEntries && entries.every(e => /^library_/.test(e.id)), String(entries.length));
check('no Graduate School data is copied (knowledge, catalogue, links, other pages)', ['programmes.json', 'knowledge', 'knowledge-public', 'student-desk.html', 'dashboard.html', 'pitch.html', 'try.html', 'slides.html'].every(f => !existsSync(join(out, f))));
check('agency.json and the kernel are in the site', existsSync(join(out, 'agency.json')) && existsSync(join(out, 'wasm/reflex_wasm_bg.wasm')) && existsSync(join(out, 'chatbot.html')));
const page = readFileSync(join(out, 'chatbot.html'), 'utf8');
check('the built page hides itself until agency.json is applied (no flash of our words)', /<html lang="th" class="agency-pending">/.test(page));
check('the redirect page keeps the query string', /location\.replace\("\.\/chatbot\.html"\+location\.search/.test(readFileSync(join(out, 'index.html'), 'utf8')));
check('the pack builder refuses a non-empty folder', (() => { try { execFileSync('node', [join(root, 'scripts/new_agency.mjs'), join(root, 'examples/library-demo'), out], { stdio: 'pipe' }); return false; } catch { return true; } })());
// where the Graduate School may appear in the chat page
const src = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const cut = (a, b, t) => { const i = t.indexOf(a), j = t.indexOf(b, i); return i < 0 || j < 0 ? null : t.slice(0, i) + t.slice(j); };
let t = cut('const DEFAULT_AGENCY = {', 'const NEUTRAL_AGENCY', src); t = t && cut('// <programme-resolve>', '// </programme-resolve>', t); t = t && cut('const FALLBACK_KB = [', '];\n', t);
check('the three allowed blocks were found', !!t);
const stray = (t || '').split('\n').filter(l => /graduate\.mahidol|บัณฑิตวิทยาลัย/.test(l)).filter(l => !/^<meta name="description"|^<title>|<div class="org">/.test(l.trim()));
check('no other line of the chat page names the Graduate School', stray.length === 0, stray.map(l => l.trim().slice(0, 90)).join(' | '));
check('other organisations default to NO backend (kernel / AI proxy only if agency.json names them)', /AGENCY\.customised \? \(AGENCY\.kernelApi\|\|''\)/.test(src) && /AGENCY\.customised \? \(AGENCY\.llmApi\|\|''\)/.test(src));
check('a pack without programmes.json skips the catalogue notice (404 -> none, only for other agencies)', /r\.status===404 && AGENCY\.customised\)\{ PROG_STATE='none'/.test(src) && /PROG_STATE!=='ok' && PROG_STATE!=='none'/.test(src));
rmSync(join(out, '..'), { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
