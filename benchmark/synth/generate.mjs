// Offline labelled questions from the manual, written by a LOCAL model (Ollama; nothing leaves the machine). The chat itself stays modelless:
// the model is only a data generator here, and a person spot-checks a sample before any number from it is trusted (review.mjs).
// Run: node benchmark/synth/generate.mjs [out.json] [--model gemma4:26b] [--only id1,id2] [--limit N]
// Resumable: entries already in out.json are skipped. Per entry: 4 Thai paraphrases (how a student would type), 2 English,
// 2 near-misses (same area, NOT answered by this entry's text). Labels: paraphrase -> gold = [entry id]; near_miss -> not this entry
// (it may still be answered by ANOTHER entry: eval.mjs treats near-misses as negatives only after review).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const out = argv[0] && !argv[0].startsWith('--') ? argv[0] : join(root, 'benchmark/synth/questions.json');
const MODEL = opt('--model') || 'gemma4:26b', only = (opt('--only') || '').split(',').filter(Boolean), limit = Number(opt('--limit') || 0);
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));

const PROMPT = e => `คุณช่วยสร้างคำถามทดสอบสำหรับระบบตอบคำถามของบัณฑิตวิทยาลัย
ข้อความคู่มือหนึ่งหัวข้อ:
หัวข้อ: ${e.title}
เนื้อหา: ${String(e.answer).slice(0, 700)}

ตอบเป็น JSON เท่านั้น รูปแบบ {"th":[...4 ข้อ],"en":[...2 ข้อ],"near_miss":[...2 ข้อ]}
- th: คำถามภาษาไทย 4 แบบที่นักศึกษาจะพิมพ์จริง ซึ่งเนื้อหาข้างบนตอบได้ ใช้คำต่างจากหัวข้อ สั้นบ้างยาวบ้าง ภาษาพูดบ้าง ห้ามคัดลอกหัวข้อ
- en: คำถามภาษาอังกฤษ 2 แบบ ที่เนื้อหาข้างบนตอบได้
- near_miss: คำถามภาษาไทย 2 ข้อ เรื่องใกล้เคียงกันที่นักศึกษาอาจถาม แต่เนื้อหาข้างบน "ไม่ได้ตอบ" (ไม่มีข้อมูลนั้นในเนื้อหา)
ห้ามใส่คำอธิบายนอก JSON`;

async function ask(e) {
  const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, format: 'json', options: { temperature: 0.7, seed: 7 }, messages: [{ role: 'user', content: PROMPT(e) }] }) });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const j = JSON.parse((await r.json()).message.content);
  const clean = a => (Array.isArray(a) ? a : []).map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(x => x.length >= 4 && x.length <= 200);
  return { th: clean(j.th).slice(0, 4), en: clean(j.en).slice(0, 2), near_miss: clean(j.near_miss).slice(0, 2) };
}

const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { model: MODEL, prompt_blake: '', created: new Date().toISOString().slice(0, 10), items: [] };
doc.prompt_sha256 = createHash('sha256').update(PROMPT({ title: '{title}', answer: '{answer}' })).digest('hex').slice(0, 16);
const done = new Set(doc.items.map(x => x.source_id));
let todo = KB.filter(e => !done.has(e.id) && (!only.length || only.includes(e.id))); if (limit) todo = todo.slice(0, limit);
let n = 0;
for (const e of todo) {
  const t0 = Date.now();
  try {
    const g = await ask(e);
    for (const q of g.th) doc.items.push({ q, kind: 'para_th', source_id: e.id, gold: [e.id] });
    for (const q of g.en) doc.items.push({ q, kind: 'para_en', source_id: e.id, gold: [e.id] });
    for (const q of g.near_miss) doc.items.push({ q, kind: 'near_miss', source_id: e.id, gold: [] });
    if (!g.th.length && !g.en.length && !g.near_miss.length) doc.items.push({ q: '', kind: 'empty', source_id: e.id, gold: [] });
  } catch (err) { console.log(`  ${e.id}: ${err.message}`); continue; }
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log(`${++n}/${todo.length} ${e.id} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(`items: ${doc.items.length} -> ${out}`);
