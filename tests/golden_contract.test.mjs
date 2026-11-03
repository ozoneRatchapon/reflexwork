// The golden contract for the Rust port (benchmark/golden, .plans/002): the current JS must still produce the frozen outputs.
// If you change answer logic on purpose, regenerate with `node scripts/golden_dump.mjs` and commit the diff (it is the spec Rust follows).
// Run: node tests/golden_contract.test.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [join(root, 'scripts/golden_dump.mjs'), '--check'], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
const n = (r.stdout.match(/^✓/gm) || []).length;
console.log(`\n${n}/4 contracts match`); process.exit(r.status === 0 && n === 4 ? 0 : 1);
