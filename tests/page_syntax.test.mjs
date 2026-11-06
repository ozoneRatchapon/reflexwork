// Every inline <script> in the shipped pages must parse. Other tests lift single functions out of the page, so a broken
// brace elsewhere (a comment swallowing code, QA round 1) passed them all while the page never booted.
// Parse only - no execution, so load-order (TDZ) errors are still out of reach: browser-probe after page JS edits.
// Run: node tests/page_syntax.test.mjs
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), ui = join(root, 'submissions/ui');
const tmp = mkdtempSync(join(tmpdir(), 'page-syntax-'));
let pass = 0, fail = 0;
for (const f of readdirSync(ui).filter(f => f.endsWith('.html'))) {
  const html = readFileSync(join(ui, f), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g; let m, i = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '', body = m[2]; if (/\bsrc=/.test(attrs) || !body.trim() || /type="(?!module)[^"]*"/.test(attrs)) continue;
    const p = join(tmp, `${f}.${i++}.${/type="module"/.test(attrs) ? 'mjs' : 'cjs'}`); writeFileSync(p, body);
    try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); pass++; }
    catch (e) { fail++; console.log(`✗ ${f} script #${i - 1}: ${String(e.stderr).split('\n').filter(Boolean).slice(0, 4).join(' | ')}`); }
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${fail ? '' : '✓ '}${pass}/${pass + fail} inline scripts parse`); process.exit(fail ? 1 : 0);
