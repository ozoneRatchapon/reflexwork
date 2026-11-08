// Guards for the engine switch (JS or Rust) in chatbot.html, without a browser. The behavioural check is benchmark/engine/engine_ab.mjs
// (same questions on the real page with each engine); this file keeps the page and the committed wasm artefact consistent.
// Run: node tests/engine_switch.test.mjs
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const page = read('submissions/ui/chatbot.html'), dts = read('submissions/ui/wasm/reflex_wasm.d.ts'), lib = read('crates/reflex-wasm/src/lib.rs');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const needs = (page.match(/const _ENGINE_NEEDS = \[([^\]]*)\]/) || [])[1]?.match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) || [];
check('the page lists the Rust exports it needs', needs.length === 10, String(needs.length));
check('every needed export is in the COMMITTED wasm artefact (a page switched to Rust with an old wasm would silently stay on JS)', needs.every(n => new RegExp(`export (function ${n}\\(|class ${n}\\b)`).test(dts)), needs.filter(n => !new RegExp(`export (function ${n}\\(|class ${n}\\b)`).test(dts)).join(','));
check('...and each one is a #[wasm_bindgen] item in the Rust source', needs.every(n => n === 'Resolver' ? /#\[wasm_bindgen\]\s*pub struct Resolver/.test(lib) : new RegExp(`#\\[wasm_bindgen\\][^#]*?pub fn ${n}\\(`).test(lib)));
const wrapped = [...page.matchAll(/^  (\w+)\s*= _engine\('(\w+)'/gm)].map(m => m[1]);
check('seven functions go through _engine and keep their JS twin as the fallback (intake is wasm-only, plan 015 step 2)', wrapped.length === 7 && ['answerPoints', 'slotLead', '_pFee', '_pScheduleData', 'decideTier', 'understand', 'resolveProgramme'].every(n => wrapped.includes(n)) && /resolveProgramme = _engine\('resolveProgramme', jsResolve/.test(page), wrapped.join(','));
check('a Rust call that throws falls back to the JS function and is counted', /catch\(e\)\{ ENG\.errors\+\+; console\.warn\(`rust engine failed in \$\{name\}, using JS`, e\); return js\(\.\.\.a\); \}/.test(page));
check('the engine comes from ?engine= and falls back to JS when the wasm is old', /new URLSearchParams\(location\.search\)\.get\('engine'\) \|\| ENGINE_DEFAULT/.test(page) && /_ENGINE_ASKED==='rust' && _ENGINE_NEEDS\.every\(n=>typeof WASM\[n\]==='function'\)/.test(page));
check('the default engine is one of js | rust (flip it only after engine_ab shows no differences)', /const ENGINE_DEFAULT = '(js|rust)';/.test(page));
check('only the page\'s own catalogue goes to the Rust resolver (tests and other callers use JS)', /if\(P!==PROG \|\| !Array\.isArray\(P\) \|\| !P\.length\) return jsResolve\(q, P, loose\);/.test(page));
check('no call site uses WASM.* outside the engine block (so JS stays one switch away)', (page.replace(/\/\/ ===== Engine switch[\s\S]*?\nload\(\)\.catch/, '').match(/\bWASM\.\w+\(|new WASM\./g) || []).length === 0);
const g = spawnSync(process.execPath, [join(root, 'scripts/wasm_golden_check.mjs'), join(root, 'submissions/ui/wasm')], { encoding: 'utf8' });
check('the committed wasm artefact reproduces all 6 golden files exactly', g.status === 0, (g.stdout + g.stderr).split('\n').filter(l => /differences|missing/.test(l) && !/ 0 differences/.test(l)).join(' | '));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
