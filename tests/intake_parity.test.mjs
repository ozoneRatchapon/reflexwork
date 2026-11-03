// The web page and the LINE bot each carry a copy of the intake logic (classifyIssue, isAdvice). They must agree on every text of the
// golden contract (benchmark/golden/intake.json). Found 2026-11-03: LINE's login pattern lacked the `i` flag, so "LOGIN ไม่ได้" and
// "Password reset" went to the manual on LINE but to the staff intake on the web.
// Run: node tests/intake_parity.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyIssue, isAdvice } from '../integrations/_shared/intake.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cases = readFileSync(join(root, 'benchmark/golden/intake.json'), 'utf8').trim().split('\n').map(l => l.replace(/,$/, '')).filter(l => l.startsWith('{')).map(l => JSON.parse(l));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const issueDiff = cases.filter(c => (classifyIssue(c.text)?.category ?? null) !== (c.issue?.category ?? null));
const adviceDiff = cases.filter(c => isAdvice(c.text) !== c.advice);
check(`LINE classifyIssue agrees with the web on ${cases.length} texts`, issueDiff.length === 0, issueDiff.slice(0, 4).map(c => JSON.stringify(c.text)).join(' '));
check(`LINE isAdvice agrees with the web on ${cases.length} texts`, adviceDiff.length === 0, adviceDiff.slice(0, 4).map(c => JSON.stringify(c.text)).join(' '));
check('upper-case login problems are caught on LINE too', classifyIssue('LOGIN ไม่ได้')?.category === 'login' && classifyIssue('Password reset')?.category === 'login');
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
