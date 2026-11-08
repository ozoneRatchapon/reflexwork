// Load the real pure functions out of submissions/ui/chatbot.html (no copies), for scripts that need them outside a browser.
// Blocks are found by the same markers/regexes the tests use. Throws if a block moved, so a refactor cannot silently skip it.
import { readFileSync } from 'node:fs';
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

// The deterministic JS search of the page (what search() falls back to without wasm), over a given KB array.
export function loadSearch(KB, html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const a = html.indexOf('function _jsGramSet'), b = html.indexOf('function search(q)');
  if (a < 0 || b < a) throw new Error('chatbot.html: search helpers not found');
  return new Function('KB', html.slice(a, b) + 'return _jsSearch;')(KB);
}

// understand() of the page, with `search` supplied by the caller (a stub in the golden contract).
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
