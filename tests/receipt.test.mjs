// Answer receipt: the page's wasm hash and the independent JS BLAKE3 (scripts/verify_receipt.mjs) give the same receipt for every real entry,
// and the receipt changes when the question, the route, the served entry, its text, or ANY other entry of the manual changes.
// Run: node tests/receipt.test.mjs   (needs submissions/ui/knowledge-index.json and the built wasm)
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { h as jsHash, verify } from '../scripts/verify_receipt.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const idx = join(root, 'submissions/ui/knowledge-index.json');
if (!existsSync(idx)) { console.log('⚠ knowledge-index.json not present - skipping'); process.exit(0); }
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const W = await import(join(root, 'submissions/ui/wasm/reflex_wasm.js'));
W.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });
const { receiptOf, manualRoot } = new Function(html.match(/\/\/ <receipt>[\s\S]*?(?=let CUR_ROUTE)/)[0] + '\nreturn {receiptOf, manualRoot};')();
const KB = JSON.parse(readFileSync(idx, 'utf8'));
check('wasm blake3_text equals the JS BLAKE3 on the empty string, ASCII and Thai', ['', 'abc', 'ค่าเทอม', 'สวัสดี 123 ✓'].every(t => W.blake3_text(t) === jsHash(t)));
const rootW = manualRoot(KB, W.blake3_text), rootJ = manualRoot(KB, jsHash);
check(`manual root over all ${KB.length} entries: wasm == JS`, rootW === rootJ && /^[0-9a-f]{64}$/.test(rootW));
let bad = 0; for (const e of KB) { const a = receiptOf('ค่าเทอมเท่าไร', 'FastPath', e, KB, W.blake3_text, rootW).receipt, b = verify({ q: 'ค่าเทอมเท่าไร', route: 'FastPath', entry: e.id, index: idx }).receipt; if (a !== b) bad++; }
check('the page (wasm) and verify_receipt.mjs (JS) agree on the receipt of every entry', bad === 0, `${bad} differ`);
const e0 = KB[0], base = receiptOf('q1', 'FastPath', e0, KB, jsHash).receipt;
check('deterministic: same inputs, same receipt', receiptOf('q1', 'FastPath', e0, KB, jsHash).receipt === base);
check('a different question changes it', receiptOf('q2', 'FastPath', e0, KB, jsHash).receipt !== base);
check('a different route changes it', receiptOf('q1', 'McpAnalyze', e0, KB, jsHash).receipt !== base);
check('a different served entry changes it', receiptOf('q1', 'FastPath', KB[1], KB, jsHash).receipt !== base);
const edit = (i, f) => KB.map((e, j) => j === i ? { ...e, ...f } : e);
check('editing the served entry\'s answer changes it', receiptOf('q1', 'FastPath', edit(0, { answer: e0.answer + ' ' })[0], edit(0, { answer: e0.answer + ' ' }), jsHash).receipt !== base);
check('editing ANOTHER entry changes it (the manual root covers the whole manual)', receiptOf('q1', 'FastPath', e0, edit(5, { answer: KB[5].answer + '.' }), jsHash).receipt !== base);
check('removing another entry changes it', receiptOf('q1', 'FastPath', e0, KB.filter((_, j) => j !== 7), jsHash).receipt !== base);
check('entry order in the file does not matter (the root sorts)', receiptOf('q1', 'FastPath', e0, [...KB].reverse(), jsHash).receipt === base);
const tmp = join(mkdtempSync(join(tmpdir(), 'rw-rcpt-')), 'i.json'); writeFileSync(tmp, JSON.stringify(edit(3, { title: KB[3].title + 'x' })));
check('verify_receipt: a receipt made on the published manual does not verify against an edited one', verify({ q: 'q1', route: 'FastPath', entry: e0.id, index: tmp, receipt: base }).match === false);
check('verify_receipt: it verifies against the unchanged file', verify({ q: 'q1', route: 'FastPath', entry: e0.id, index: idx, receipt: base }).match === true);
check('the page shows it only in the judge view and only for answers from an entry', /receiptUI\(q, entryId\) \+ `<div class="fb"/.test(html) && /class="proof-full judge-only receipt"/.test(html) && /if\(!blake3_text \|\| !entryId\) return ''/.test(html));
check('the old proof is untouched (still question + route, still labelled as not covering the answer)', /ไม่ครอบคลุมตัวคำตอบ/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
