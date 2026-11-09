// Node loader hook: `import m from './x.wasm'` gives a WebAssembly.Module, as Cloudflare Workers does for the kernel worker.
export async function load(url, context, next) {
  if (!url.endsWith('.wasm')) return next(url, context);
  return {
    format: 'module',
    shortCircuit: true,
    source: `import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url';\nexport default new WebAssembly.Module(readFileSync(fileURLToPath(${JSON.stringify(url)})));`,
  };
}
