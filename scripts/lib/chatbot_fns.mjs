// Load the real pure functions out of submissions/ui/chatbot.html (no copies), for scripts that need them outside a browser.
// Blocks are found by the same markers/regexes the tests use. Throws if a block moved, so a refactor cannot silently skip it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function loadChatbotFns(html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8')) {
  const need = (re, name) => { const m = html.match(re); if (!m) throw new Error(`chatbot.html: block not found: ${name}`); return m[1] ?? m[0]; };
  const linkify = need(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/, 'linkify');
  const prog = need(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/, 'programme-resolve');
  const slots = need(/const _SLOTS=[\s\S]*?\n  return ''; }\n/, 'slotLead');
  const points = need(/const _SPLIT_BEFORE[\s\S]*?\n}\n(?=const _SHOW_POINTS)/, 'answerPoints');
  const tier = need(/const _BAND=[\s\S]*?\nfunction decideTier[\s\S]*?\n}\n/, 'decideTier');
  return new Function(`${linkify}\n${prog}\n${slots}\n${points}\n${tier}\nreturn { answerPoints, slotLead, _pSchedule, _pFee, resolveProgramme, decideTier };`)();
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
