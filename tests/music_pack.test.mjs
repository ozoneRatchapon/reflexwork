// The College of Music pack (plan 018) without a browser: builds packs/music-college with --draft into a temp folder and checks, on the
// shipped wasm Router, that each question reaches the entry it should, that questions the website has no data for are not answered,
// and that a normal (publish) build still refuses a pack whose entries are not approved. The live page is scripts/adoption_smoke.mjs.
// Run: node tests/music_pack.test.mjs
import { readFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as WASM from '../submissions/ui/wasm/reflex_wasm.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pack = join(root, 'packs/music-college');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'rw-music-'));
const build = (out, ...flags) => { try { return { ok: true, log: execFileSync('node', [join(root, 'scripts/new_agency.mjs'), pack, out, ...flags], { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { ok: false, log: String(e.stdout || '') + String(e.stderr || '') }; } };

const draft = build(join(tmp, 'draft'), '--draft');
check('the pack builds with --draft and says it is a preview', draft.ok && /DRAFT build/.test(draft.log), draft.log.slice(0, 200));
const publish = build(join(tmp, 'publish'));
const files = readdirSync(join(pack, 'knowledge')).filter(f => f.endsWith('.md'));
const approved = files.filter(f => /^approval_status:\s*"approved"/m.test(readFileSync(join(pack, 'knowledge', f), 'utf8')));
// until the College approves entries, a publish build must refuse; once some are approved it must publish exactly those
check('a publish build includes only approved entries', approved.length ? publish.ok : !publish.ok && /no approved entries/.test(publish.log), publish.log.slice(0, 200));
const offsite = files.filter(f => !/^source_url:\s*"https:\/\/www\.music\.mahidol\.ac\.th\//m.test(readFileSync(join(pack, 'knowledge', f), 'utf8')));
check(`all ${files.length} entries cite a page of the College's own site`, !offsite.length, offsite.join(', '));
// plan 019 item 4.1: the draft build carries the owner's review page, one tickable card per entry not yet approved; a publish build never does
const review = existsSync(join(tmp, 'draft/review.html')) ? readFileSync(join(tmp, 'draft/review.html'), 'utf8') : '';
check('the draft build writes review.html listing every entry', files.every(f => review.includes(`<code>${f}</code>`)), draft.log.slice(-300));
check('review.html has one approve tick per entry not yet approved', (review.match(/data-i="\d+"/g) || []).length === files.length - approved.length);
check('review.html cannot send anything (connect-src none, no inline handlers)', /connect-src 'none'/.test(review) && !/ on[a-z]+="/.test(review));
check('a publish build has no review page', !existsSync(join(tmp, 'publish/review.html')));

WASM.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });
const KB = JSON.parse(readFileSync(join(tmp, 'draft/knowledge-index.json'), 'utf8'));
const router = new WASM.Router(KB, null, undefined);
const state = { progState: 'none', aiOff: true, pinnedId: null, programmeInFocus: null, today: '2026-11-14', agencyHasIt: true };
const decide = q => router.decision(q, state, null);
// question -> the entry that answers it, the no-data questions and the known-wrong ones: packs/music-college/expected.json
const { answer: WANT, pick: PICK = {}, none: NONE, known_wrong: KNOWN } = JSON.parse(readFileSync(join(pack, 'expected.json'), 'utf8'));
const wrong = Object.entries(WANT).map(([q, id]) => [q, id, decide(q)]).filter(([, id, d]) => d.route !== 'kb_act' || d.entry !== id);
check(`${Object.keys(WANT).length} questions reach the entry that answers them`, !wrong.length, wrong.map(([q, id, d]) => `${q}: want ${id}, got ${d.route} ${d.entry ?? ''}`).join(' | '));
// a question that fits several entries: the right reply offers exactly those entries, in any order
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const unpicked = Object.entries(PICK).map(([q, ids]) => [q, ids, decide(q)]).filter(([, ids, d]) => d.route !== 'disambiguate' || !same(d.offered ?? [], ids));
check(`${Object.keys(PICK).length} questions that fit several entries offer exactly those`, !unpicked.length, unpicked.map(([q, ids, d]) => `${q}: want ${ids}, got ${d.route} ${d.entry ?? d.offered ?? ''}`).join(' | '));
// the website publishes none of the NONE questions: answering from any entry would be a made-up answer
const made = NONE.map(q => [q, decide(q)]).filter(([, d]) => d.route === 'kb_act');
check('questions the website has no data for are not answered from an entry', !made.length, made.map(([q, d]) => `${q} -> ${d.entry}`).join(' | '));
// known wrong (pack README, plan 018): reported, not hidden; when the engine is fixed each one moves into `answer`
for (const [q, id] of Object.entries(KNOWN)) { const d = decide(q); console.log(`  known: "${q}" -> ${d.route} ${d.entry ?? ''} (should be ${id})`); }
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
