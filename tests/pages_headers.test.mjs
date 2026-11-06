// Pages response headers (QA F65): the staff dashboard cannot be framed; every page sends nosniff.   Run: node tests/pages_headers.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const h = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/_headers'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok) => { console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };
const rules = {}; let cur = null;   // Pages format: an unindented path line, then indented "Name: value" lines
for (const l of h.split('\n')) { if (!l.trim() || l.startsWith('#')) continue; if (!/^\s/.test(l)) { cur = l.trim(); rules[cur] = {}; } else if (cur) { const i = l.indexOf(':'); rules[cur][l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); } }
check('every page: X-Content-Type-Options nosniff', rules['/*']?.['x-content-type-options'] === 'nosniff');
for (const p of ['/dashboard.html', '/dashboard']) check(`${p}: cannot be framed (X-Frame-Options DENY + frame-ancestors 'none')`, rules[p]?.['x-frame-options'] === 'DENY' && rules[p]?.['content-security-policy'] === "frame-ancestors 'none'");
check('no page-wide CSP that would block the inline scripts', !('content-security-policy' in (rules['/*'] || {})));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
