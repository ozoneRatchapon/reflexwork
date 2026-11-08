#!/usr/bin/env node
// Plan 015 step 1: the Rust decision order checked against the frozen route contract (benchmark/golden/route.json) WITHOUT a browser.
// Covers the single-question entries (kind "single"). Each question is asked with a fresh state (no programme in focus, no pinned chip,
// the catalogue loaded). Each entry records the page's AI_OFF flag (`ai_off`, written by route_golden.mjs); a question must match the
// Rust route with that flag. An entry without the field (recorded before the flag was stored) passes if either setting matches, and is
// counted separately so the gap stays visible.
// Session and pin entries need the page's state carry-over and stay in route_golden.mjs.
// The Rust side returns null for "not found" and for "waiting for the AI rewrite"; the golden records those as not_found / unrouted /
// understood_by_ai (the AI rewrite answered later), which all count as null.
//   node benchmark/golden/route_rust_check.mjs           exit 1 on any question whose Rust route differs from the golden
// Loads the wasm the page ships (submissions/ui/wasm), so it checks what the page would run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = f => readFileSync(join(root, f), 'utf8');
const wasm = await import(join(root, 'submissions/ui/wasm/reflex_wasm.js'));
wasm.initSync({ module: readFileSync(join(root, 'submissions/ui/wasm/reflex_wasm_bg.wasm')) });

// the page's own filters (chatbot.html: _okKb, _okProg)
const okKb = e => !!e && typeof e === 'object' && typeof e.title === 'string' && e.title.trim() && typeof e.answer === 'string';
const okProg = p => !!p && typeof p === 'object' && typeof p.code === 'string' && p.code && typeof p.title === 'string' && p.title.trim();
const KB = JSON.parse(R('submissions/ui/knowledge-index.json')).filter(okKb);
const PROG = JSON.parse(R('submissions/ui/programmes.json')).programmes.filter(okProg);
const router = new wasm.Router(KB, PROG);

// todayIso(): Asia/Bangkok calendar date, as the page computes it
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const stateFor = (aiOff, progState = 'ok') => ({ progState, aiOff, pinnedId: null, programmeInFocus: null, today, agencyHasIt: true });
const AI_REWRITE_ROUTES = new Set(['not_found', 'unrouted', 'understood_by_ai']);

const matches = (got, golden) => (got === null ? AI_REWRITE_ROUTES.has(golden) : got === golden);
const golden = JSON.parse(R('benchmark/golden/route.json')).filter(x => x.kind === 'single');
let exact = 0, unflagged = 0;
const diffs = [];
for (const x of golden) {
  // the catalogue may still be loading in the recording run (PROG_STATE 'loading'): golden catalogue_not_ready
  if (x.route === 'catalogue_not_ready') { const loading = router.decide(x.q, stateFor(false, 'loading'), null) ?? null; if (loading === 'catalogue_not_ready') exact++; else diffs.push({ q: x.q, golden: x.route, rust_loading: loading }); continue; }
  if (typeof x.ai_off !== 'boolean') {
    unflagged++;
    const on = router.decide(x.q, stateFor(true), null) ?? null, off = router.decide(x.q, stateFor(false), null) ?? null;
    if (matches(on, x.route) || matches(off, x.route)) exact++; else diffs.push({ q: x.q, golden: x.route, rust_ai_on: on, rust_ai_off: off });
    continue;
  }
  const got = router.decide(x.q, stateFor(x.ai_off), null) ?? null;
  if (matches(got, x.route)) exact++; else diffs.push({ q: x.q, golden: x.route, ai_off: x.ai_off, rust: got });
}
console.log(`route_rust_check: ${golden.length} single questions, ${exact} match, ${diffs.length} differ (${unflagged} entries without ai_off, checked with either setting)`);
for (const d of diffs.slice(0, 20)) console.log('  diff:', JSON.stringify(d));
process.exit(diffs.length ? 1 : 0);
