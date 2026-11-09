// Variant of router.mjs: the manual only (no programme catalogue: progState none, programme routes off).
// The Router is still built at startup.
import line from '../../../integrations/line-worker/worker.mjs';
import routerWasm from '../../../submissions/ui/wasm/reflex_wasm_bg.wasm';
import { initSync, Router } from '../../../submissions/ui/wasm/reflex_wasm.js';
import kb from '../../../submissions/ui/knowledge-index.json';

initSync({ module: routerWasm });
const router = new Router(kb, null, undefined);
const state = { progState: 'none', aiOff: true, pinnedId: null, programmeInFocus: null, today: '2026-11-10', agencyHasIt: true };

export default {
  async fetch(req, env, ctx) {
    const q = new URL(req.url).searchParams.get('q');
    if (q) return Response.json(router.decision(q, state, null));
    return line.fetch(req, env, ctx);
  },
};
