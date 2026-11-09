// Pages response headers (QA F65): the staff dashboard cannot be framed; every page sends nosniff and has its own CSP.   Run: node tests/pages_headers.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const h = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/_headers'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok) => { console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };
const rules = {}; let cur = null;   // Pages format: an unindented path line, then indented "Name: value" lines
for (const l of h.split('\n')) { if (!l.trim() || l.startsWith('#')) continue; if (!/^\s/.test(l)) { cur = l.trim(); rules[cur] = {}; } else if (cur) { const i = l.indexOf(':'); rules[cur][l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); } }
check('every page: X-Content-Type-Options nosniff', rules['/*']?.['x-content-type-options'] === 'nosniff');
for (const p of ['/dashboard.html', '/dashboard']) check(`${p}: cannot be framed (X-Frame-Options DENY + frame-ancestors 'none')`, rules[p]?.['x-frame-options'] === 'DENY' && /(^|; )frame-ancestors 'none'(;|$)/.test(rules[p]?.['content-security-policy'] || ''));
// Pages joins a header set by two matching rules with a comma = two policies, both enforced: the per-page CSP must be the only one.
check('no page-wide CSP on /* (it would be joined with each page policy)', !('content-security-policy' in (rules['/*'] || {})));
// The per-page CSP is generated and checked by `cargo run -q -p pages-csp -- --check` (hashes); here only its shape.
const csps = Object.entries(rules).filter(([p]) => p !== '/*').map(([p, r]) => [p, r['content-security-policy'] || '']);
check('every page route has a CSP', csps.length >= 16 && csps.every(([, c]) => c.startsWith("default-src 'self'")), csps.filter(([, c]) => !c).map(([p]) => p).join(' '));
check("no script-src allows 'unsafe-inline' or 'unsafe-eval'", csps.every(([, c]) => !/script-src[^;]*'unsafe-(inline|eval)'/.test(c)));
check('the chat may reach only its two workers (and loopback mocks)', /connect-src 'self' https:\/\/reflexwork-kernel\.solana-thailand\.workers\.dev https:\/\/reflexwork-llm-proxy\.solana-thailand\.workers\.dev http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*;/.test(rules['/chatbot']?.['content-security-policy'] || ''));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
