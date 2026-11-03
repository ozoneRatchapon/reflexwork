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
