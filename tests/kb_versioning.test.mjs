// Versioning in the manual (old vs new announcement): `supersedes` drops the replaced entry from the index and the newer one names it;
// `valid_from` / `valid_to` label an answer that is not yet / no longer in force. Builds temp packs with the real builder and runs the
// real validityTag() from chatbot.html.  Run: node tests/kb_versioning.test.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

const tmp = mkdtempSync(join(tmpdir(), 'rw-ver-'));
const entry = (id, title, extra = '', approval = 'approved') => `---\ntitle: "${title}"\ncategory: "test"\nsource_url: "https://example.ac.th/${id}"\napproval_status: "${approval}"\n${extra}---\n## ${title}\n\nคำตอบของ ${title}\n`;
const build = (name, files) => {
  const dir = join(tmp, name, 'knowledge'); mkdirSync(dir, { recursive: true });
  for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f + '.md'), body);
  const out = join(tmp, name, 'index.json');
  const r = spawnSync('python3', ['-I', join(root, 'submissions/build_knowledge_index.py'), '--knowledge-dir', dir, '--out', out], { encoding: 'utf8' });
  let idx = null; try { idx = JSON.parse(readFileSync(out, 'utf8')); } catch {}
  return { code: r.status, err: r.stderr, out: r.stdout, idx };
};

// 1) the newer entry replaces the old one
{ const r = build('ok', { fee_2568: entry('fee_2568', 'ค่าธรรมเนียม 2568'), fee_2569: entry('fee_2569', 'ค่าธรรมเนียม 2569', 'supersedes: "fee_2568"\nvalid_from: "2026-08-01"\nvalid_to: "2027-07-31"\n'), other: entry('other', 'เรื่องอื่น') });
  const ids = (r.idx || []).map(e => e.id);
  check('supersedes: the replaced entry is not in the index', r.code === 0 && !ids.includes('fee_2568') && ids.includes('fee_2569') && ids.includes('other'), ids.join(','));
  const n = (r.idx || []).find(e => e.id === 'fee_2569') || {};
  check('the newer entry names what it replaces (id + title)', JSON.stringify(n.supersedes) === JSON.stringify([{ id: 'fee_2568', title: 'ค่าธรรมเนียม 2568' }]), JSON.stringify(n.supersedes));
  check('valid_from / valid_to are carried into the index', n.valid_from === '2026-08-01' && n.valid_to === '2027-07-31');
  check('the build says what it replaced', /replaced: fee_2568 → fee_2569/.test(r.out), r.out);
  check('an entry without these fields is unchanged (no new keys)', Object.keys((r.idx || []).find(e => e.id === 'other') || {}).every(k => !['supersedes', 'valid_from', 'valid_to'].includes(k))); }

// 2) an UNAPPROVED replacement must not hide the entry that is live today
{ const r = build('pending', { a_old: entry('a_old', 'เก่า'), a_new: entry('a_new', 'ใหม่', 'supersedes: "a_old"\n', 'pending_owner_approval') });
  check('an unapproved replacement does not hide the live entry', r.code === 0 && (r.idx || []).some(e => e.id === 'a_old'), JSON.stringify(r.idx)); }

// 3) mistakes stop the build (no index written)
for (const [name, files, re] of [
  ['missing', { x: entry('x', 'x', 'supersedes: "no_such"\n') }, /no no_such\.md/],
  ['self', { x: entry('x', 'x', 'supersedes: "x"\n') }, /supersedes itself/],
  ['loop', { x: entry('x', 'x', 'supersedes: "y"\n'), y: entry('y', 'y', 'supersedes: "x"\n') }, /loops back/],
  ['date', { x: entry('x', 'x', 'valid_to: "31/07/2570"\n') }, /YYYY-MM-DD/],
  ['order', { x: entry('x', 'x', 'valid_from: "2027-01-01"\nvalid_to: "2026-01-01"\n') }, /after valid_to/],
]) { const r = build(name, files); check(`build refuses: ${name}`, r.code === 1 && re.test(r.err) && r.idx === null, `code ${r.code} ${r.err}`); }
rmSync(tmp, { recursive: true, force: true });

// 4) the chat label (real code from chatbot.html)
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const vSrc = html.match(/function validityTag\(hit, today\)\{[\s\S]*?\n\}\n/)[0];
const validityTag = new Function(blk('today') + blk('linkify') + blk('programme-resolve') + vSrc + 'return validityTag;')();
const txt = h => h.replace(/<[^>]+>/g, ' ');
check('no dates, no supersedes → no label', validityTag({ title: 'x' }, '2026-11-07') === '');
check('valid_to passed → "may be out of date" with the Thai date', /มีผลถึง 31 ก\.ค\. 2569 อาจไม่เป็นปัจจุบัน/.test(txt(validityTag({ valid_to: '2026-07-31' }, '2026-11-07'))), txt(validityTag({ valid_to: '2026-07-31' }, '2026-11-07')));
check('valid_to today or later → no warning', validityTag({ valid_to: '2026-11-07' }, '2026-11-07') === '');
check('valid_from in the future → "in force from"', /มีผลตั้งแต่ 1 ส\.ค\. 2570/.test(txt(validityTag({ valid_from: '2027-08-01' }, '2026-11-07'))));
check('supersedes → names the older entry, escaped', /ฉบับนี้ใช้แทน: ค่าธรรมเนียม &lt;2568&gt;/.test(validityTag({ supersedes: [{ id: 'a', title: 'ค่าธรรมเนียม <2568>' }] }, '2026-11-07')));
check('kbBody puts the label above the answer', /function kbBody\(hit, q\)\{ return validityTag\(hit\) \+ kbBodyCore\(hit, q\); \}/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
