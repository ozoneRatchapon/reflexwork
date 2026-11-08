// The Rust decision order for tests and scripts, without a browser: the shipped wasm (submissions/ui/wasm) and the page's own
// catalogue (knowledge-index.json, programmes.json). The same filters and "today" as route_rust_check.mjs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as WASM from '../../submissions/ui/wasm/reflex_wasm.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = f => readFileSync(join(root, f), 'utf8');
WASM.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });

const okKb = e => !!e && typeof e === 'object' && typeof e.title === 'string' && e.title.trim() && typeof e.answer === 'string';
const okProg = p => !!p && typeof p === 'object' && typeof p.code === 'string' && p.code && typeof p.title === 'string' && p.title.trim();
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')).filter(okKb);
const PROG = JSON.parse(R('submissions/ui/programmes.json')).programmes.filter(okProg);
const router = new WASM.Router(KB, PROG);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const state = { progState: 'ok', aiOff: true, pinnedId: null, programmeInFocus: null, today, agencyHasIt: true };

// the route the Rust side picks for a typed question (null = waiting for the AI rewrite / not found)
export const routeOf = q => router.decide(q, state, null) ?? null;
export const catalogue = { KB, PROG };
