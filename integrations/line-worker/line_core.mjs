// The LINE decision for ANY agency's manual (plan 019 item 6.2): the worker builds it once from its own KB copy (kb-data.mjs, Graduate
// School), tests build it from a pack's knowledge-index.json (tests/line_pack.test.mjs). No wasm import here: the caller passes the
// Router class of its own build (the worker's bundled wasm, or Node's file read), so this file runs on Workers and in Node alike.

/** LINE's state for the router: no catalogue, no tapped topic, no programme in focus; the AI is on (the grounded proxy). */
export const lineState = today => ({ progState: 'none', aiOff: false, pinnedId: null, programmeInFocus: null, today, agencyHasIt: true });

/** The nearest entries count only when they share real words with the question (search score >= NEAR_MIN), at most NEAR_MAX. */
const NEAR_MIN = 3, NEAR_MAX = 3;

/**
 * One manual's LINE decision. `kb`: the entries (id, title, keywords, answer, ...); `Router`: the wasm Router class.
 * Returns { byId, decide(text, today) -> router decision (route null = not found), near(text) -> nearest titles }.
 */
export function makeLine(kb, Router) {
  const router = new Router(kb, null, undefined);
  const byId = new Map(kb.map(e => [e.id, e]));
  const decide = (text, today) => router.decision(String(text || ''), lineState(today), null);
  const near = text => router.search(String(text || ''), NEAR_MAX).filter(h => h.s >= NEAR_MIN).map(h => byId.get(h.id)?.title).filter(Boolean);
  return { byId, decide, near };
}
