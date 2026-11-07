#!/usr/bin/env node
// Recompute an answer receipt from the published manual, with a BLAKE3 that is NOT the page's wasm (integrations/kernel-worker/vendor/blake3.js).
// The receipt (judge view, under an answer) = BLAKE3(JSON [version, question, route, entry id, entry digest, manual root]); see chatbot.html <receipt>.
//   node scripts/verify_receipt.mjs --q "<the question as the page normalised it>" --route FastPath --entry <entry id> [--index knowledge-index.json] [--receipt <hex>]
// Prints the receipt, the entry digest and the manual root. With --receipt it exits 1 when the numbers differ (the manual changed, or a different
// question / route / entry). Needs the SAME knowledge-index.json the page loaded (staff answers that were live at that moment are not in the file).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blake3 } from '../integrations/kernel-worker/vendor/blake3.js';
import { bytesToHex, utf8ToBytes } from '../integrations/kernel-worker/vendor/utils.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
// the receipt functions come from the page itself (one definition), only the hash function differs
const { receiptOf } = new Function(html.match(/\/\/ <receipt>[\s\S]*?(?=let CUR_ROUTE)/)[0] + '\nreturn {receiptOf};')();
export const h = t => bytesToHex(blake3(utf8ToBytes(t)));
export function verify({ q, route, entry, index, receipt }) {
  const kb = JSON.parse(readFileSync(index, 'utf8')), e = kb.find(x => x.id === entry);
  if (!e) throw new Error(`no entry "${entry}" in ${index}`);
  const r = receiptOf(q, route, e, kb, h);
  return { ...r, entries: kb.length, match: receipt ? r.receipt === receipt.trim().toLowerCase() : null };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const q = opt('--q'), route = opt('--route'), entry = opt('--entry');
  if (q == null || !route || !entry) { console.error('usage: node scripts/verify_receipt.mjs --q "<question>" --route <route> --entry <id> [--index file] [--receipt hex]'); process.exit(2); }
  const out = verify({ q, route, entry, index: opt('--index') || join(root, 'submissions/ui/knowledge-index.json'), receipt: opt('--receipt') });
  console.log(`receipt        ${out.receipt}\nentry digest   ${out.digest}\nmanual root    ${out.root}  (${out.entries} entries)`);
  if (out.match !== null) { console.log(out.match ? '✓ matches' : '✗ DOES NOT match'); process.exit(out.match ? 0 : 1); }
}
