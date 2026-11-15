#!/usr/bin/env node
// Build a deployable copy of ReflexWork for ANOTHER organisation from a small "pack" folder:
//   node scripts/new_agency.mjs <pack-dir> <out-dir> [--draft] [--with-line] [--with-kernel]
//   --draft: include entries not yet approved, for a local preview the owner reviews. Never publish a --draft build.
//            Also writes review.html (crates/pack-tools, `pack-review`): every entry with its source, valid_to and status; the
//            owner ticks entries and downloads approve.patch for `git apply`. Static: nothing leaves the browser.
//   --with-line / --with-kernel: also write the agency's Cloudflare Worker configs in <out-dir>.workers/ (crates/pack-tools `pack-workers`,
//            plan 019 6.4/6.5): line/ = the shared LINE app + this pack's kb-data.mjs, kernel/ = the kernel on its own D1 name. Placeholders
//            only (REPLACE_...), never the Graduate School's IDs; the build prints what the owner must fill in. Nothing is deployed.
// Every build also runs pack-lint (competing titles, empty keyword lines, answer dates after valid_to) and prints its warnings.
// pack-dir contains:  agency.json  (name, texts, example questions, contact links; optional "vocab": the route words it changes)   +   knowledge/*.md  (approved entries; same format as submissions/ui/knowledge-public)
//                     optional: system-links.json (named systems -> URLs), programmes.json (a catalogue, only if you have one)
// out-dir is a static site (chat page + the WebAssembly kernel + your index). Host it anywhere (Cloudflare Pages, GitHub Pages, nginx).
// Nothing of the Graduate School is copied: its knowledge, catalogue, links and pages stay behind; the chat page's defaults for it are replaced by agency.json.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS = ['--draft', '--with-line', '--with-kernel'];
const args = process.argv.slice(2), draft = args.includes('--draft'), withLine = args.includes('--with-line'), withKernel = args.includes('--with-kernel');
const unknown = args.filter(a => a.startsWith('--') && !FLAGS.includes(a));
const [packArg, outArg] = args.filter(a => !a.startsWith('--'));
if (!packArg || !outArg || unknown.length) { console.error(`usage: node scripts/new_agency.mjs <pack-dir> <out-dir> [${FLAGS.join('] [')}]${unknown.length ? `  (unknown: ${unknown.join(' ')})` : ''}`); process.exit(64); }
const pack = resolve(packArg), out = resolve(outArg), ui = join(root, 'submissions/ui');
const fail = m => { console.error('ERROR: ' + m); process.exit(1); };
if (!existsSync(join(pack, 'agency.json'))) fail(`${pack}/agency.json not found`);
if (!existsSync(join(pack, 'knowledge'))) fail(`${pack}/knowledge/ not found (put approved .md entries there)`);
let agency; try { agency = JSON.parse(readFileSync(join(pack, 'agency.json'), 'utf8')); } catch (e) { fail('agency.json is not valid JSON: ' + e.message); }
for (const k of ['name', 'title', 'greeting']) if (!agency[k]) fail(`agency.json needs "${k}"`);
// "vocab" (optional): only the words this agency changes; the engine checks it (unknown keys, patterns that do not compile), not a JS copy
if (agency.vocab !== undefined) {
  const WASM = await import(pathToFileURL(join(ui, 'wasm/reflex_wasm.js')).href);
  WASM.initSync({ module: readFileSync(join(ui, 'wasm/reflex_wasm_bg.wasm')) });
  try { WASM.vocab_check(JSON.stringify(agency.vocab)); } catch (e) { fail(`agency.json "vocab": ${e}`); }
}
if (existsSync(out) && readdirSync(out).length) fail(`${out} is not empty (choose a new folder)`);
mkdirSync(out, { recursive: true });
// the kernel and the page: nothing else from ui/ is copied (no Graduate School data, catalogue, slides or dashboards)
cpSync(join(ui, 'wasm'), join(out, 'wasm'), { recursive: true });
cpSync(join(ui, 'theme.css'), join(out, 'theme.css'));
let page = readFileSync(join(ui, 'chatbot.html'), 'utf8');
if (!/<html lang="th">/.test(page)) fail('unexpected chatbot.html');
page = page.replace('<html lang="th">', '<html lang="th" class="agency-pending">');
writeFileSync(join(out, 'chatbot.html'), page);
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><script>location.replace("./chatbot.html"+location.search+location.hash)</script><meta http-equiv="refresh" content="1; url=./chatbot.html"><a href="./chatbot.html">เปิดผู้ช่วยตอบคำถาม</a>\n');   // keeps ?api= ?ai= ?view= when someone opens /
cpSync(join(pack, 'agency.json'), join(out, 'agency.json'));
for (const opt of ['system-links.json', 'programmes.json']) if (existsSync(join(pack, opt))) cpSync(join(pack, opt), join(out, opt));
if (!existsSync(join(out, 'system-links.json'))) writeFileSync(join(out, 'system-links.json'), JSON.stringify({ links: [] }));
const res = execFileSync('python3', ['-I', join(root, 'submissions/build_knowledge_index.py'), '--knowledge-dir', join(pack, 'knowledge'), '--out', join(out, 'knowledge-index.json'), ...(draft ? ['--all'] : [])], { encoding: 'utf8' });
const n = JSON.parse(readFileSync(join(out, 'knowledge-index.json'), 'utf8')).length;
console.log(res.trim().split('\n')[0]);
// crates/pack-tools (Rust): pack-lint warns (never fails the build); pack-review writes the owner's review page for --draft
const pack_tool = (bin, ...rest) => {
  try { return execFileSync('cargo', ['run', '-q', '-p', 'pack-tools', '--bin', bin, '--', ...rest], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { console.error(`WARNING: ${bin} did not run (needs the Rust toolchain): ` + String(e.stderr || e.message).trim()); return ''; }
};
const lint = pack_tool('pack-lint', pack);
if (lint && !/: \d+ entries, 0 warnings$/.test(lint)) console.log(lint);
if (draft) {
  console.log('DRAFT build: entries not yet approved are included. Preview only; do not publish this folder.');
  const rel = relative(root, join(pack, 'knowledge')), prefix = rel.startsWith('..') || isAbsolute(rel) ? join(pack, 'knowledge') : rel;   // patch paths from the repository root
  const review = pack_tool('pack-review', pack, join(out, 'review.html'), '--prefix', prefix);
  if (review) console.log(review);
}
if (!n) fail('no approved entries: set approval_status: "approved" in each .md frontmatter');
if (withLine || withKernel) {
  const workers = pack_tool('pack-workers', pack, out, ...(withLine ? ['--line'] : []), ...(withKernel ? ['--kernel'] : []), '--repo', root);
  if (workers) console.log(workers + (draft && withLine ? '\n  DRAFT: line/kb-data.mjs holds entries not yet approved; never deploy it' : ''));
}
console.log(`ready: ${out}\n  ${n} entries for "${agency.name}"\n  try it:   cd ${out} && python3 -m http.server 8000   → http://localhost:8000/\n  publish:  upload the folder to any static host (e.g. npx wrangler pages deploy ${out})`);
