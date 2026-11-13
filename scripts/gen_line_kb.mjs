#!/usr/bin/env node
// Regenerate the LINE worker's KB copy (integrations/line-worker/kb-data.mjs) from the SAME approved-only index the web serves.
// LINE was 70 entries behind (70 vs 132, found 2026-11-03). Run after build_knowledge_index.py:
//   python3 submissions/build_knowledge_index.py && node scripts/gen_line_kb.mjs [--check]
// --check exits 1 if kb-data.mjs is out of date. Another agency's LINE manual comes from its pack: crates/pack-tools `pack-line-kb`
// (same bytes; crates/pack-tools/tests/line_kb.rs checks the body against kb-data.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/chatbot_fns.mjs';
const FIELDS = ['id', 'title', 'category', 'keywords', 'answer', 'source_url', 'faq_number', 'approval_status', 'steps', 'academic_year', 'semester'];
const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'))
  .map(e => Object.fromEntries(FIELDS.filter(k => e[k] !== undefined && e[k] !== null && e[k] !== '').map(k => [k, e[k]])));
const out = `// AUTO-GENERATED from submissions/ui/knowledge-index.json (approved-only) — do not edit by hand.\n// Regenerate: python3 submissions/build_knowledge_index.py && node scripts/gen_line_kb.mjs\nexport const KB = ${JSON.stringify(KB, null, 1)};\n`;
const file = join(root, 'integrations/line-worker/kb-data.mjs');
if (process.argv.includes('--check')) {
  const same = readFileSync(file, 'utf8') === out;
  console.log(same ? `✓ LINE KB matches the web index (${KB.length} entries)` : `✗ LINE KB is out of date — run node scripts/gen_line_kb.mjs`);
  process.exit(same ? 0 : 1);
}
writeFileSync(file, out); console.log(`wrote ${file} (${KB.length} entries)`);
