// Load the real pure functions out of submissions/ui/chatbot.html (no copies), for scripts that need them outside a browser.
// Blocks are found by the same markers/regexes the tests use. Throws if a block moved, so a refactor cannot silently skip it.
// Two kinds: the page as it runs now (pageSearch, shippedWasm: Rust only), and the JS oracle that wrote benchmark/golden (loadChatbotFns,
// loadSearch, loadUnderstand). The page has no JS copies since plan 015 step 5, so the oracle loaders need `html` from a snapshot of a
// commit that still has them: git show 15ef269:submissions/ui/chatbot.html > /tmp/chatbot_ref.html
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyIssue, isAdvice, isEnglish } from "../../integrations/_shared/intake.mjs";
import * as WASM from "../../submissions/ui/wasm/reflex_wasm.js";
export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let _inited = false;
// the page's Rust engine, the same shipped build the page loads (submissions/ui/wasm)
function wasmReady(){ if(_inited) return; WASM.initSync({ module: readFileSync(join(root, "submissions/ui/wasm/reflex_wasm_bg.wasm")) }); _inited = true; }

export function loadChatbotFns(html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const need = (re, name) => { const m = html.match(re); if (!m) throw new Error(`chatbot.html: block not found: ${name}`); return m[1] ?? m[0]; };
  const linkify = need(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/, 'linkify');
  const today = need(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/, 'today');
  const prog = need(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/, 'programme-resolve');
  const slots = need(/const _SLOTS=[\s\S]*?\n  return ''; }\n/, 'slotLead');
  const points = need(/const _SPLIT_BEFORE[\s\S]*?\n}\n(?=const _SHOW_POINTS)/, 'answerPoints');
  const tier = need(/const _BAND=[\s\S]*?\nfunction decideTier[\s\S]*?\n}\n/, 'decideTier');
  wasmReady();
  return new Function("WASM", "ENG", `${today}\n${linkify}\n${prog}\n${slots}\n${points}\n${tier}\nreturn { answerPoints, slotLead, _pSchedule, _pFee, resolveProgramme, decideTier };`)(WASM, {});
}

// The page's search() over a given KB array: its own block (Rust kb_search + the staff-supersede step) on the shipped wasm.
export function pageSearch(KB, html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const a = html.indexOf('function _staffSupersede('), b = html.indexOf('\n// Evidence selectors:', a);
  if (a < 0 || b < a) throw new Error('chatbot.html: search block not found');
  wasmReady();
  return new Function('KB', 'WASM', 'wasm_kb_search', html.slice(a, b) + '\nreturn search;')(KB, WASM, WASM.kb_search);
}

// The page's decideTier() (the Rust tier rule on the shipped wasm; the page attaches the entries).
export function pageDecideTier(html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const m = html.match(/^function decideTier\(\{gate, ranked\}\)\{[\s\S]*?\n\}\n/m);
  if (!m) throw new Error('chatbot.html: decideTier() not found');
  wasmReady();
  return new Function('WASM', m[0] + '\nreturn decideTier;')(WASM);
}

// The last commit whose chatbot.html still has the JS copies (plan 015 step 4c). refHtml() reads that page from git, for the JS oracle and
// for research experiments that need a JS internal (the trigram set, the scorer source) that the page no longer ships.
export const REF_COMMIT = '15ef269';
let _refHtml = null;
export function refHtml() {
  _refHtml ??= execFileSync('git', ['show', `${REF_COMMIT}:submissions/ui/chatbot.html`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  return _refHtml;
}

// The JS search block of a snapshot (`_jsGramSet` ... `_jsSearch`), as source. Experiments edit it to try scorer variants.
export function searchSource(html = refHtml()) {
  const a = html.indexOf('function _jsGramSet'), b = html.indexOf('function search(q)');
  if (a < 0 || b < a) throw new Error('chatbot.html snapshot: search helpers not found');
  return html.slice(a, b);
}

// JS experiment helper: the snapshot's character-trigram set (`_jsGramSet`), the feature the search scores on.
export function loadGramSet(html = refHtml()) {
  return new Function('KB', searchSource(html) + 'return _jsGramSet;')([]);
}

// JS oracle: the deterministic JS search of a pre-step-5 page snapshot, over a given KB array.
export function loadSearch(KB, html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const a = html.indexOf('function _jsGramSet'), b = html.indexOf('function search(q)');
  if (a < 0 || b < a) throw new Error('chatbot.html: search helpers not found');
  return new Function('KB', html.slice(a, b) + 'return _jsSearch;')(KB);
}

// JS oracle: understand() of a pre-step-5 page snapshot, with `search` supplied by the caller (a stub in the golden contract).
export function loadUnderstand(search, html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const m = html.match(/function understand\(phrases\)\{[\s\S]*?\n\}\n/);
  if (!m) throw new Error('chatbot.html: understand() not found');
  return new Function('search', m[0] + 'return understand;')(search);
}

// classifyIssue / isAdvice / isEnglish. The page's copies are the wasm port now (plan 015 step 2); the JS contract is the LINE module, which is
// lockstep-tested against the wasm (tests/intake_parity.test.mjs, benchmark/golden/intake.json).
export function loadIntake() {
  return { classifyIssue, isAdvice, isEnglish };
}

// The shipped Rust engine (submissions/ui/wasm), for page blocks that call the Rust resolver. Pass as `WASM` to the block's Function.
export function shippedWasm() { wasmReady(); return WASM; }
