#!/usr/bin/env node
// reflexwork init <name> — scaffold a FastPath chatbot over your own KB.
// distributable-kernel spec, Phase B. Zero deps (Node stdlib only). Writes a
// template tree with federation OFF and no endpoint — private by default (R2/R3).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd !== 'init' || !argv[1]) {
  console.error('usage: reflexwork init <name>');
  process.exit(1);
}

const name = argv[1];
const root = resolve(process.cwd(), name);
if (existsSync(root)) {
  console.error(`refusing to overwrite existing path: ${root}`);
  process.exit(1);
}

const write = (rel, content) => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
  console.log('  +', rel);
};

console.log(`scaffolding ReflexWork app → ${name}/`);

// config: private by default — federation OFF, no endpoint (spec R2/R3)
write('reflexwork.config.json', JSON.stringify({
  name,
  kernel: '@reflexwork/kernel',
  gate_threshold: 0.72,
  federation: { enabled: false, endpoint: '', install_id: '' },
}, null, 2) + '\n');

write('package.json', JSON.stringify({
  name, private: true, type: 'module',
  scripts: { 'build:kb': 'node build_knowledge_index.mjs', dev: 'node server.mjs' },
  dependencies: { '@reflexwork/kernel': '^0.1.0' },
}, null, 2) + '\n');

write('kb/example.md', `---
title: ตัวอย่างหัวข้อ KB
keywords: ตัวอย่าง example คำสำคัญ
source_url: https://example.org/
---
นี่คือคำตอบจากคู่มือ (ground truth). kernel จะตอบจากข้อความนี้ตรง ๆ โดยไม่แต่งเพิ่ม.
`);

write('build_knowledge_index.mjs', `// Build kb/*.md → knowledge-index.json (frontmatter + body).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const files = readdirSync('kb').filter(f => f.endsWith('.md'));
const entries = files.map(f => {
  const raw = readFileSync('kb/' + f, 'utf8');
  const m = raw.match(/^---\\n([\\s\\S]*?)\\n---\\n([\\s\\S]*)$/);
  const fm = Object.fromEntries((m ? m[1] : '').split('\\n').filter(Boolean)
    .map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { title: fm.title || f, keywords: fm.keywords || '', source_url: fm.source_url || '', answer: (m ? m[2] : raw).trim() };
});
writeFileSync('knowledge-index.json', JSON.stringify(entries, null, 2));
console.log('wrote knowledge-index.json —', entries.length, 'entries');
`);

write('server.mjs', `// Minimal local dev server: route a message through the kernel, answer from KB.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { init, routeTask } from '@reflexwork/kernel';

const KB = JSON.parse(readFileSync('knowledge-index.json', 'utf8'));
await init();

function search(q) {
  const ql = q.toLowerCase();
  return KB.map(e => ({ e, s: (e.keywords.toLowerCase().split(/\\s+/).filter(k => ql.includes(k)).length) }))
           .filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]?.e;
}

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/ask') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const { q } = JSON.parse(body || '{}');
      const d = routeTask('DataQuery', q || '');
      const hit = d.fast_path ? search(q) : null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ decision: d, answer: hit ? hit.answer : null,
        note: d.fast_path ? (hit ? 'FastPath from KB (0 token)' : 'FastPath but no KB match — abstain')
                          : 'escalate to your LLM path' }));
    });
    return;
  }
  res.statusCode = 404; res.end('POST /ask { q }');
}).listen(8787, '127.0.0.1', () => console.log('dev server → http://127.0.0.1:8787  (POST /ask { q })'));
`);

write('README.md', `# ${name}

A FastPath chatbot scaffolded by ReflexWork, over your own KB.

## Quickstart
\`\`\`bash
npm install
npm run build:kb     # kb/*.md → knowledge-index.json
npm run dev          # http://127.0.0.1:8787  (POST /ask { q })
\`\`\`

## Privacy
This scaffold is **private by default**: \`reflexwork.config.json\` has
\`federation.enabled=false\` and no endpoint. Nothing leaves your machine until
you opt in. See the ReflexWork federation docs before enabling it.
`);

console.log(`\ndone. next:\n  cd ${name} && npm install && npm run build:kb && npm run dev`);
