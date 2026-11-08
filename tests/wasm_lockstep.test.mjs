// The search the page runs is the Rust/WASM kb_search, the only copy (the JS twin went in plan 015 step 5). Its gate floor: a weak vector
// match is never lifted to a confident score by lexical overlap alone, and the lift still fires where it was written for.
// Run: node tests/wasm_lockstep.test.mjs      Needs knowledge-index.json (python3 submissions/build_knowledge_index.py) and Node >= 20.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
if (!existsSync(join(root, 'submissions/ui/knowledge-index.json'))) { check('knowledge-index.json present', false); process.exit(1); }
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')), lite = KB.map(e => ({ id: e.id, keywords: e.keywords }));
const wasm = await import(pathToFileURL(join(root, 'submissions/ui/wasm/reflex_wasm.js')).href);
wasm.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });

// the floor itself: overlap alone must not make a weak candidate look confident
const weak = ['เมืองหลวงของฝรั่งเศสคืออะไร', 'อัตราการรับเข้าเท่าไหร่', 'ทำงานพิเศษระหว่างเรียนได้ไหม'];
check('out-of-scope questions with a weak vector match are not lifted to a confident score', weak.every(q => { const r = wasm.kb_search(lite, q)[0]; return !r || r.s <= 3; }), weak.map(q => wasm.kb_search(lite, q)[0].s).join());
check('the overlap lift still does its job when the vector supports it (cosine ~0.21, overlap 11 -> s=6, the case it was written for)', (() => { const r = wasm.kb_search(lite, 'ตรวจความซ้ำเกินเท่าไหร่ถึงไม่ผ่าน')[0]; return r && r.id === 'thesis_turnitin' && r.s === 6 && r.cos >= 0.15 && r.cos < 0.25; })());
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
