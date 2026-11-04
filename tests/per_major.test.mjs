// Programmes that announce per major (QA G19): the catalogue stores every major's announcement, and the card says whose data it
// shows and lists the rest with their own status.   Run: node tests/per_major.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8'), py = readFileSync(join(root, 'submissions/build_programme_catalogue.py'), 'utf8');
const DOC = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const F = new Function(blk('today') + blk('linkify') + blk('programme-resolve') + '\nreturn {programmeCard};')();
const multi = DOC.programmes.filter(p => Array.isArray(p.sub_announcements) && p.sub_announcements.length);
check('the catalogue carries per-major announcements', multi.length >= 7, String(multi.length));
check('each per-major row uses one of its own sub announcements', multi.every(p => p.announcement && p.sub_announcements.some(s => s.id === p.announce_id) && /^\d{4}[MDNC][GS](0[1-9]|1\d|2[01])$/.test(p.announce_id)));
const open = multi.find(p => p.sub_announcements.length > 1) || multi[0];
const card = F.programmeCard(open, DOC.fetched_at, DOC.year, '', open.title).html.replace(/<[^>]+>/g, '');
check('the card says the announcement is per major and whose data it shows', /📌 หลักสูตรนี้ประกาศรับสมัครแยกตามวิชาเอก \(\d+ ฉบับ\)/.test(card) && card.includes(open.announcement.major));
check('the card lists every major with its own status', open.sub_announcements.every(s => card.includes(`${s.major} · ${s.status}`)));
const stat = F.programmeCard(open, DOC.fetched_at, DOC.year, 'status', open.title).html;
check('an "is it open?" answer lists the majors too', /📌/.test(stat));
check('the scraper probes <id>01.. only when there is no general announcement, and stops at the first unknown id', /if not ann:[\s\S]*?for k in range\(1, MAX_MAJORS \+ 1\):[\s\S]*?if not sa:\s*break/.test(py));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
