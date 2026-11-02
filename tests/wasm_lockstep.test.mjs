// The Rust/WASM kb_search (what the page runs) and the JS twin in chatbot.html (what the tests run, and the page's fallback) must give the
// SAME ranking, the same integer score and the same overlap. Before this file the check lived in a scratch script outside the repo.
// Run: node tests/wasm_lockstep.test.mjs      Needs knowledge-index.json (python3 submissions/build_knowledge_index.py) and Node >= 20.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
if (!existsSync(join(root, 'submissions/ui/knowledge-index.json'))) { check('knowledge-index.json present', false); process.exit(1); }
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8')), lite = KB.map(e => ({ id: e.id, keywords: e.keywords }));
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8'), ev = readFileSync(join(root, 'tests/kb_search.test.mjs'), 'utf8');
const js = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KB);
const wasm = await import(pathToFileURL(join(root, 'submissions/ui/wasm/reflex_wasm.js')).href);
wasm.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });

const qs = new Set([...ev.matchAll(/^\s*\['([^']+)',/gm)].map(m => m[1]));
for (const e of KB) { qs.add(e.title); qs.add('ช่วยแนะนำเรื่อง' + e.title.slice(0, 18)); qs.add(e.title.slice(0, 12)); }
['เมืองหลวงของฝรั่งเศสคืออะไร', 'คณบดีบัณฑิตวิทยาลัยคือใคร', 'อัตราการรับเข้าเท่าไหร่', 'ทำงานพิเศษระหว่างเรียนได้ไหม', 'what is the capital of France', 'who is the dean of the graduate school', 'can I defer my enrollment',
 'tell me a joke', 'วันนี้อากาศเป็นยังไง', 'ขอวีซ่านักศึกษาต่างชาติยังไง', 'ห้องสมุดอยู่ที่ไหน', 'Turnitin เกิน 25% ทำอย่างไร', 'turnitin กีเปอเซน'].forEach(q => qs.add(q));
const bad = []; let n = 0;
for (const q of qs) { n++; const a = wasm.kb_search(lite, q).slice(0, 3), b = js(q).slice(0, 3);
  const same = a.length === b.length && a.every((x, i) => x.id === b[i].e.id && x.s === b[i].s && x.overlap === b[i].overlap && Math.abs(x.cos - b[i].cos) < 1e-4);
  if (!same) bad.push(`${q.slice(0, 30)}: wasm ${a[0] && a[0].id}/${a[0] && a[0].s} vs js ${b[0] && b[0].e.id}/${b[0] && b[0].s}`); }
check(`WASM and JS twin agree on the top 3 (id, score, overlap, cosine) for ${n} probes`, bad.length === 0, bad.slice(0, 4).join(' | '));
// the floor itself: overlap alone must not make a weak candidate look confident, in either implementation
const weak = ['เมืองหลวงของฝรั่งเศสคืออะไร', 'อัตราการรับเข้าเท่าไหร่', 'ทำงานพิเศษระหว่างเรียนได้ไหม'];
check('out-of-scope questions with a weak vector match are not lifted to a confident score (WASM)', weak.every(q => { const r = wasm.kb_search(lite, q)[0]; return !r || r.s <= 3; }), weak.map(q => wasm.kb_search(lite, q)[0].s).join());
check('...nor in the JS twin', weak.every(q => { const r = js(q)[0]; return !r || r.s <= 3; }));
check('the overlap lift still does its job when the vector supports it (cosine 0.18, overlap 11 -> s=6, the case it was written for)', (() => { const r = wasm.kb_search(lite, 'ตรวจความซ้ำเกินเท่าไหร่ถึงไม่ผ่าน')[0]; return r && r.id === 'thesis_turnitin' && r.s === 6 && r.cos >= 0.15 && r.cos < 0.20; })());
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
