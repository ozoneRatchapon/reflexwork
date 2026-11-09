// The page runs the answer logic only in Rust (plan 015 step 5: the ?engine= switch and the JS twins are gone). Without a browser, this
// keeps the page and the committed wasm artefact consistent; the behaviour is tests/chat_e2e.test.mjs and tests/golden_contract.test.mjs.
// Run: node tests/rust_engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const page = read('submissions/ui/chatbot.html'), dts = read('submissions/ui/wasm/reflex_wasm.d.ts'), lib = read('crates/reflex-wasm/src/lib.rs');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const needs = (page.match(/const _WASM_NEEDS = \[([^\]]*)\]/) || [])[1]?.match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) || [];
check('the page lists the Rust exports it needs', needs.length >= 13, String(needs.length));
// not listed: the init function, and the exports the page treats as optional or calls before load() (route_task, classify_smalltalk, blake3_text)
const callable = [...new Set([...page.matchAll(/\bWASM\.(\w+)/g)].map(m => m[1]))].filter(n => !['default', 'route_task', 'classify_smalltalk', 'blake3_text'].includes(n));
check('every WASM.* the page calls is in the list (a missing one would fail at answer time, not at boot)', callable.every(n => needs.includes(n)), callable.filter(n => !needs.includes(n)).join(','));
check('every needed export is in the COMMITTED wasm artefact', needs.every(n => new RegExp(`export (function ${n}\\(|class ${n}\\b)`).test(dts)), needs.filter(n => !new RegExp(`export (function ${n}\\(|class ${n}\\b)`).test(dts)).join(','));
const inRust = n => ['Resolver', 'Router'].includes(n) ? new RegExp(`#\\[wasm_bindgen\\]\\s*pub struct ${n}\\b`).test(lib + read('crates/reflex-wasm/src/route/router.rs'))
  : new RegExp(`#\\[wasm_bindgen(?:\\(js_name = ${n}\\))?\\][^#]*?pub fn ${n}\\(|#\\[wasm_bindgen\\(js_name = ${n}\\)\\]`).test(lib);
check('...and each one is a #[wasm_bindgen] item in the Rust source', needs.every(inRust), needs.filter(n => !inRust(n)).join(','));
check('load() stops (boot error + retry) when the wasm lacks a needed export', /const _missing = _WASM_NEEDS\.filter\(n=>typeof WASM\[n\]!=='function'\);\n\s*if\(_missing\.length\) throw /.test(page));
check('no engine switch left: no ?engine=, no _engine(), no ENGINE_DEFAULT', !/get\('engine'\)|_engine\(|ENGINE_DEFAULT|_ENGINE_/.test(page));
check('no intake or English pre-pass copy left (plan 015 steps 2, 4c)', !/_ISSUE_CATS|_NOT_PERSONAL|const _ADVICE|const _FACTUAL|englishProgrammeAsk/.test(page));
check('no JS twin left: search, answer points, slot lead, tier, understand, fee, schedule are Rust calls',
  !/function _jsSearch|function _cosToScore|const _SLOTS=|const _BAND=|const _SPLIT_BEFORE/.test(page)
  && /function answerPoints\(body\)\{ return WASM\.answer_points\(/.test(page) && /function slotLead\(hit,q\)\{ return WASM\.slot_lead\(/.test(page)
  && /function _pFee\(lines\)\{ return WASM\.fee_table\(/.test(page) && /function _pScheduleData\(lines\)\{ return WASM\.schedule_table\(/.test(page)
  && /WASM\.decide_tier\(/.test(page) && /WASM\.understand\(/.test(page) && /wasm_kb_search\(KB\.map/.test(page));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
