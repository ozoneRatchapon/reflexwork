// The page survives a broken dependency (QA F34/F57): a failed kernel glue shows an error with a retry instead of an endless
// spinner, and one malformed data row never stops the chat.   Run: node tests/load_resilience.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
check('F34: no static import of the kernel glue (its failure would stop the module before load())', !/^import [^\n]*reflex_wasm\.js/m.test(html));
check('F34: the glue is imported in a try, and init() rejects when it is missing', /try\{ WASM = await import\('\.\/wasm\/reflex_wasm\.js'\); \}catch\(e\)\{ WASM_ERR = e;/.test(html) && /const init = typeof WASM\.default==='function' \? WASM\.default : async\(\)=>\{ throw /.test(html));
check('F34: the boot error only blames file:// when the page really is a file', /location\.protocol==='file:' \? 'ต้องเปิดผ่าน http\(s\)/.test(html) && !/'<div[^']*>ต้องเปิดผ่าน http\(s\) \(ไม่ใช่ file:\/\/\) — ลองรีเฟรช/.test(html));
const src = html.slice(html.indexOf('const _okKb ='), html.indexOf('\n', html.indexOf('const _okProg =')) + 1);
const { _okKb, _okProg } = new Function(src + 'return {_okKb, _okProg};')();
const kb = [null, 5, 'x', {}, { title: 'x' }, { title: ' ', answer: 'a' }, { id: 'a', title: 'T', answer: 'A' }];
const pr = [null, {}, { code: 'A' }, 7, { code: '', title: 'x' }, { code: '6236M01G', title: 'สาขาวิชา X' }];
check('F57: only usable KB rows are kept', JSON.stringify(kb.filter(_okKb)) === JSON.stringify([{ id: 'a', title: 'T', answer: 'A' }]), JSON.stringify(kb.filter(_okKb)));
check('F57: only usable programme rows are kept', pr.filter(_okProg).length === 1 && pr.filter(_okProg)[0].code === '6236M01G');
check('F57: load() filters the KB and the catalogue with them', /KB = Array\.isArray\(KB\) \? KB\.filter\(_okKb\) : \[\];/.test(html) && /d\.programmes=d\.programmes\.filter\(_okProg\)/.test(html));
check('F57: agency examples are normalised (null / bad items cannot stop the boot)', /AGENCY\.examples = \(Array\.isArray\(AGENCY\.examples\) \? AGENCY\.examples : \[\]\)\.filter\(e=>e && typeof e\.q==='string'/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
