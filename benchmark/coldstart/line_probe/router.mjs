// Worst case for plan 009 C4: the LINE worker + the page's router wasm + the manual + the 2.6 MB programme catalogue,
// with the Router BUILT AT STARTUP (module scope). A real port would build it lazily on the first message.
import line from '../../../integrations/line-worker/worker.mjs';
import routerWasm from '../../../submissions/ui/wasm/reflex_wasm_bg.wasm';
import { initSync, Router } from '../../../submissions/ui/wasm/reflex_wasm.js';
import kb from '../../../submissions/ui/knowledge-index.json';
import progDoc from '../../../submissions/ui/programmes.json';

initSync({ module: routerWasm });
const router = new Router(kb, progDoc.programmes, undefined);
const state = { progState: 'ok', aiOff: true, pinnedId: null, programmeInFocus: null, today: '2026-11-10', agencyHasIt: true };

export default {
  async fetch(req, env, ctx) {
    const q = new URL(req.url).searchParams.get('q');
    if (q) return Response.json(router.decision(q, state, null));
    return line.fetch(req, env, ctx);
  },
};
