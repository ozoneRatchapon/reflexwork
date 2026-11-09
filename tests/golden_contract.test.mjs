// The golden contract (benchmark/golden, .plans/002): the wasm the page ships must reproduce the frozen outputs exactly.
// The JS that wrote them is gone from the page (plan 015 step 5); the files are the spec now. To re-run that JS oracle, pass a snapshot:
//   git show 15ef269:submissions/ui/chatbot.html > /tmp/chatbot_ref.html && node scripts/golden_dump.mjs --check --html /tmp/chatbot_ref.html
// Run: node tests/golden_contract.test.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [join(root, 'scripts/wasm_golden_check.mjs'), join(root, 'submissions/ui/wasm')], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
const n = (r.stdout.match(/ 0 differences$/gm) || []).length;
console.log(`\n${n}/6 contracts match`); process.exit(r.status === 0 && n === 6 ? 0 : 1);
