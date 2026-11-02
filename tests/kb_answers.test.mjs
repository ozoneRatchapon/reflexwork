// Answer-quality gate for knowledge-index.json.
// Run: node tests/kb_answers.test.mjs   (exit 0 = pass, 1 = fail)
//
// The recall eval (kb_search.test.mjs) only checks WHICH entry wins. It cannot see an
// entry that wins and then shows the student an empty or title-only answer — which is
// exactly what happened to 35 of 62 imported GradMahidol docs when build_knowledge_index.py
// only kept a paragraph that did not start with '#' / 'คำค้น'. This test pins the
// user-visible side: every entry must carry real answer text.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const idxPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/knowledge-index.json');
if (!existsSync(idxPath)) { console.log('⚠ knowledge-index.json not present — run build_knowledge_index.py. Skipping.'); process.exit(0); }
const KB = JSON.parse(readFileSync(idxPath, 'utf8'));

const content = a => String(a || '').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).join('\n').trim();
const bad = (name, ids) => { const ok = ids.length === 0; console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${ids.length}: ${ids.slice(0, 8).join(', ')}`)); return ok ? 0 : 1; };

let fail = 0;
fail += bad('no empty answers', KB.filter(e => !String(e.answer || '').trim()).map(e => e.id));
fail += bad('no heading-only answers (< 30 chars of real content)', KB.filter(e => content(e.answer).length < 30).map(e => e.id));
fail += bad('no answer starts with a markdown title (# …)', KB.filter(e => /^#[^#]/.test(String(e.answer).trim())).map(e => e.id));
fail += bad('no answer is only a provenance blurb ("ข้อมูลชุดนี้…")', KB.filter(e => /^ข้อมูลชุดนี้/.test(String(e.answer).trim())).map(e => e.id));
fail += bad('no answer carries the "ข้อมูลทดสอบ / รอรับรอง" status footer', KB.filter(e => /ข้อมูลทดสอบ|รอรับรองจากเจ้าของงาน/.test(e.answer)).map(e => e.id));
fail += bad('every entry has a source_url', KB.filter(e => !e.source_url).map(e => e.id));
console.log(`\n${KB.length} entries checked, ${fail ? fail + ' check(s) failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
