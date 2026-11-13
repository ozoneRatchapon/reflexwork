#!/usr/bin/env node
// Build a deployable copy of ReflexWork for ANOTHER organisation from a small "pack" folder:
//   node scripts/new_agency.mjs <pack-dir> <out-dir> [--draft]
//   --draft: include entries not yet approved, for a local preview the owner reviews. Never publish a --draft build.
// pack-dir contains:  agency.json  (name, texts, example questions, contact links)   +   knowledge/*.md  (approved entries; same format as submissions/ui/knowledge-public)
//                     optional: system-links.json (named systems -> URLs), programmes.json (a catalogue, only if you have one)
// out-dir is a static site (chat page + the WebAssembly kernel + your index). Host it anywhere (Cloudflare Pages, GitHub Pages, nginx).
// Nothing of the Graduate School is copied: its knowledge, catalogue, links and pages stay behind; the chat page's defaults for it are replaced by agency.json.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), draft = args.includes('--draft');
const [packArg, outArg] = args.filter(a => a !== '--draft');
if (!packArg || !outArg) { console.error('usage: node scripts/new_agency.mjs <pack-dir> <out-dir>'); process.exit(64); }
const pack = resolve(packArg), out = resolve(outArg), ui = join(root, 'submissions/ui');
const fail = m => { console.error('ERROR: ' + m); process.exit(1); };
if (!existsSync(join(pack, 'agency.json'))) fail(`${pack}/agency.json not found`);
if (!existsSync(join(pack, 'knowledge'))) fail(`${pack}/knowledge/ not found (put approved .md entries there)`);
let agency; try { agency = JSON.parse(readFileSync(join(pack, 'agency.json'), 'utf8')); } catch (e) { fail('agency.json is not valid JSON: ' + e.message); }
for (const k of ['name', 'title', 'greeting']) if (!agency[k]) fail(`agency.json needs "${k}"`);
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
if (draft) console.log('DRAFT build: entries not yet approved are included. Preview only; do not publish this folder.');
if (!n) fail('no approved entries: set approval_status: "approved" in each .md frontmatter');
console.log(`ready: ${out}\n  ${n} entries for "${agency.name}"\n  try it:   cd ${out} && python3 -m http.server 8000   → http://localhost:8000/\n  publish:  upload the folder to any static host (e.g. npx wrangler pages deploy ${out})`);
