// Run: node benchmark/scale/probe.mjs   - search time and index size when the knowledge base is 10x / 50x larger (machine-dependent timings).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), R = f => readFileSync(join(root, f), 'utf8');
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')), html = R('submissions/ui/chatbot.html');
const { jsSearch: search } = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn {jsSearch:_jsSearch};'))(KB);
const qs = ['ส่งรูปเล่มภายในกี่วัน', 'ค่าธรรมเนียมการศึกษาเท่าไร', 'ลืมรหัสผ่าน e-Thesis', 'Turnitin เกิน 25% ทำอย่างไร', 'ขอหนังสือรับรองสถานภาพนักศึกษา'];
// Brute-force JS twin search time vs corpus size (the real corpus repeated k times with distinct ids/titles). Timing only: it says nothing about accuracy at scale.
console.log('| entries | JS search ms/query | index MB (JSON) |\n|---|---|---|');
for (const k of [1, 10, 50]) { const big = []; for (let i = 0; i < k; i++) for (const e of KB) big.push({ ...e, id: e.id + '_' + i, title: e.title + (i ? ' #' + i : '') });
  const s = new Function('KB', html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/)[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(big); s(qs[0]);
  const t0 = performance.now(); let n = 0; for (let r = 0; r < 5; r++) for (const q of qs) { s(q); n++; }
  console.log(`| ${big.length} | ${((performance.now() - t0) / n).toFixed(1)} | ${(JSON.stringify(big).length / 1e6).toFixed(2)} |`); }
