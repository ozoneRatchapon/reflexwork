// Latency of each deterministic layer, measured in Node with the SAME code the page runs (the real WASM build, the real JS blocks).
//   node benchmark/compare/latency.mjs
// Machine-dependent by nature: compare orders of magnitude and ratios, not the last digit. Warm-up first; median and p95 over many calls.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ui = join(root, 'submissions/ui');
const wasm = await import(join(ui, 'wasm/reflex_wasm.js'));
wasm.initSync({ module: readFileSync(join(ui, 'wasm/reflex_wasm_bg.wasm')) });
const KB = JSON.parse(readFileSync(join(ui, 'knowledge-index.json'), 'utf8')), P = JSON.parse(readFileSync(join(ui, 'programmes.json'), 'utf8')).programmes;
const html = readFileSync(join(ui, 'chatbot.html'), 'utf8');
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const { resolveProgramme, normChat, linkify } = new Function(blk('chat-normalize') + blk('linkify') + blk('programme-resolve') + '\nreturn {resolveProgramme, normChat, linkify};')();
const jm = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/);
const jsSearch = new Function('KB', jm[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KB);
const lite = KB.map(e => ({ id: e.id, keywords: e.keywords }));
const links = JSON.parse(readFileSync(join(ui, 'system-links.json'), 'utf8')).links;
const Qs = ['ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน', 'ค่าสมัครสอบ MU GRAD Plus เท่าไร', 'ลาพักการศึกษาต้องทำอย่างไร', 'turnitin กีเปอเซน', 'how to apply for admission', 'อยากสมัครเรียนจิตวิทยาคลินิก', 'ค่าเทอมวิศวกรรมชีวการแพทย์ ปริญญาเอก', 'เรียนรายยย'];
const answers = KB.map(e => e.answer);
function bench(name, fn, n = 4000) {
  for (let i = 0; i < 300; i++) fn(i);                       // warm-up
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = process.hrtime.bigint(); fn(i); t[i] = Number(process.hrtime.bigint() - a) / 1000; }
  t.sort(); return `| ${name} | ${t[n >> 1].toFixed(1)} | ${t[Math.floor(n * 0.95)].toFixed(1)} |`;
}
console.log(`## Latency (microseconds per call; median / p95; ${process.platform}-${process.arch}, node ${process.version}; machine-dependent)\n`);
console.log('| layer | median µs | p95 µs |\n|---|---|---|');
console.log(bench('kernel gate + BLAKE3 fingerprint (WASM route_task)', i => wasm.route_task('DataQuery', Qs[i % Qs.length], 2048, 128)));
console.log(bench(`KB search over ${KB.length} entries (WASM kb_search)`, i => wasm.kb_search(lite, Qs[i % Qs.length]), 2000));
console.log(bench(`KB search over ${KB.length} entries (JS twin)`, i => jsSearch(Qs[i % Qs.length]), 1000));
console.log(bench(`programme resolver over ${P.length} programmes`, i => resolveProgramme(normChat(Qs[i % Qs.length]), P), 500));
console.log(bench('input normalisation (normChat)', i => normChat(Qs[i % Qs.length])));
console.log(bench('answer linkification (linkify, 132 real answers cycled)', i => linkify(answers[i % answers.length], links)));
console.log('\nFor scale: one LLM call is typically hundreds of milliseconds (350-800 ms is the figure quoted in submissions/concept-paper.md; not measured here) = 10^5-10^6 µs.');
