// The staff dashboard must not drain the kernel's per-IP rate limit (shared with students on a campus IP) and must never draw a
// failed panel as "nothing yet" or live data as demo (QA F44).   Run: node tests/dashboard_poll.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const num = n => Number((html.match(new RegExp(`${n} = (\\d+)`)) || [])[1]);
const POLL_MS = num('POLL_MS'), FULL_EVERY = num('FULL_EVERY');
const tick = html.slice(html.indexOf('async function tick('), html.indexOf('// Group gaps by the source SYSTEM'));
// 2 requests per poll + 4 more every FULL_EVERY polls; the worker refills 1 token/s
const rps = (2 + 4 / FULL_EVERY) / (POLL_MS / 1000);
check('steady polling stays well under the 1 req/s refill', rps > 0 && rps <= 0.5, `${rps.toFixed(2)} req/s`);
check('no 2 s interval left', !/setInterval\(tick, 2000\)/.test(html));
check('non-2xx is an error, not data', /if\(!r\.ok\) throw new HttpError\(r\.status\)/.test(html));
check('no panel substitutes an empty list on failure', !/\.catch\(\(\)=>\(\{(?:entries|drafts):\[\]\}\)\)/.test(tick));
check('each optional panel renders only on success', ['g && g.ok', 'kd && kd.ok', 'ec && ec.ok', 'lk && lk.ok'].every(x => tick.includes(`if(${x})`)));
check('a 429 backs off', /status===429[\s\S]*?BACKOFF_UNTIL = Date\.now\(\) \+ BACKOFF_MS/.test(tick) && /if\(Date\.now\(\) < BACKOFF_UNTIL\) return;/.test(tick));
check('after the kernel answered once, a failure keeps the data and says so (no demo)', /if\(LIVE_SEEN\)\{ linkDown\([\s\S]*?return; \}\n\s*\/\/ No local API[^\n]*\n\s*renderDemo\(\);/.test(tick));
check('live data restores the banner renderDemo overwrote', /LIVE_SEEN = true; \$\('phase'\)\.textContent = PHASE_LIVE;/.test(tick));
check('the header states the real cadence', /รีเฟรชทุก 10 วิ · รายการรีเฟรชทุก 30 วิ/.test(tick) && !/รีเฟรชทุก 2 วิ/.test(html));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
