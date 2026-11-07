// The chat's decision order against its recorded contract (benchmark/golden/route.json): a sample (every 12th question + all follow-up sessions' neighbours)
// is asked in a real headless Chrome and must land on the same branch (data-route). Full check: node benchmark/golden/route_golden.mjs --check
// Needs Google Chrome; skips (exit 0) when Chrome or the golden file is missing. Run: node tests/route_golden.test.mjs
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!existsSync(join(root, 'benchmark/golden/route.json'))) { console.log('⚠ benchmark/golden/route.json not present - skipping'); process.exit(0); }
if (!chrome || !existsSync(chrome)) { console.log('⚠ Chrome not found - skipping'); process.exit(0); }
const r = spawnSync('node', [join(root, 'benchmark/golden/route_golden.mjs'), '--check', '--limit', '12'], { encoding: 'utf8', timeout: 280000 });
const out = (r.stdout || '') + (r.stderr || '');
const m = /(\d+) checked.*?: (\d+) differences, (\d+) not in golden/.exec(out);
const ok = !!m && +m[2] === 0 && +m[3] === 0 && +m[1] >= 100;
console.log((ok ? '✓' : '✗') + ' route contract: ' + (m ? `${m[1]} sampled, ${m[2]} differences, ${m[3]} not in golden` : 'no result'));
if (!ok) console.log(out.split('\n').slice(-30).join('\n'));
console.log(`\n${ok ? 1 : 0}/1 passed`); process.exit(ok ? 0 : 1);
