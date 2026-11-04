// Short questions around one topic word ("มีทุนไหม") used to end in "not understood": one 3-letter Thai word is a single
// tri-gram, so the search scored ~1 everywhere (measured 2026-11-03). Now the topic word is matched against entry TITLES.
// Runs the real topicCore()/topicPicks() from chatbot.html over the knowledge index. Run: node tests/topic_picker.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const src = page.match(/const _TOPIC_HEAD=[\s\S]*?\nfunction topicPicks\(q\)\{[\s\S]*?\n\}\n/);
check('topic picker source found', !!src);
const idx = join(root, 'submissions/ui/knowledge-index.json');
if (!existsSync(idx)) { console.log('- build the index first (python3 submissions/build_knowledge_index.py)'); process.exit(fail ? 1 : 0); }
const KB = JSON.parse(readFileSync(idx, 'utf8'));
const { topicCore, topicPicks } = new Function('KB', src[0] + 'return { topicCore, topicPicks };')(KB);
for (const q of ['มีทุนไหม', 'ทุน', 'ขอทุนยังไง', 'ทุนเรียน']) {
  const r = topicPicks(q);
  check(`"${q}" offers the scholarship entries`, r && r.core === 'ทุน' && r.hits.some(e => e.id === 'scholarship_types') && r.hits.every(e => /ทุน/.test(e.title)), r && `${r.core} ${r.hits.length}`);
}
check('"มีหอพักไหม" offers the dormitory entry', (r => r && r.hits.length === 1 && r.hits[0].id === 'gm_dormitory_navigation')(topicPicks('มีหอพักไหม')));
for (const q of ['วิธีทำต้มยำกุ้ง', 'อธิการบดีมหิดลคือใคร', 'สอบตกวิชาบังคับต้องเรียนซ้ำไหม', 'ไหม', 'มีไหม'])
  check(`off-topic or empty "${q}" gets no list`, topicPicks(q) === null);
check('too generic (more than 12 titles, e.g. "การ") gets no list', topicPicks('การ') === null);
check('"วิทยานิพนธ์" (11 titles) gets the list; the list gets a search box (> 10)', (r => r && r.hits.length === 11)(topicPicks('วิทยานิพนธ์')));
check('a picked chip answers THAT entry (pinned), not a re-search of its title', /const ranked = pinned \? \[\{e:PIN, s:9, cos:1, overlap:99\}\] : \(_pre \|\| search\(q\)\);/.test(page) && /PIN = e; \$\('q'\)\.value = e\.title; ask\(\);/.test(page));
check('the picker is offered only after the normal search found nothing (escalate branch, before the AI step)', page.indexOf('const tp = topicPicks(q);') > page.indexOf("logGap(q);") && page.indexOf('const tp = topicPicks(q);') < page.indexOf('rewriteQuery(q).then('));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
