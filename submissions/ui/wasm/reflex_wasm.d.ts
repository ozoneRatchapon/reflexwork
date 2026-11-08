/* tslint:disable */
/* eslint-disable */

/**
 * The programme catalogue, indexed once, so each question only pays for matching (port of `resolveProgramme`).
 */
export class Resolver {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `programmes`: the `programmes` array of programmes.json.
     */
    constructor(programmes: any);
    /**
     * `{kind: "one"|"many"|"broad", codes, topic, via, levelMissing, total}` or `null`. `loose` = nearest names only.
     */
    resolve(q: string, loose: boolean): any;
}

/**
 * The whole chat decision order (plan 009). Built from the page's manual rows and programme rows (or null when there is no
 * catalogue), then asked one question at a time. `decide` returns the route name or `null` (= the page's "not found" path).
 */
export class Router {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `state`: `{progState, aiOff, pinnedId, programmeInFocus, today, agencyHasIt}`; `rewrite`: the AI's phrases (array) or null.
     * Returns the route name, or `null` for the page's "not found" path.
     */
    decide(q: string, state: any, rewrite: any): any;
    /**
     * Same arguments as `decide`. Returns `{route, personal, stuck: {key, picks, areas}, programme, aspect, timeIntent, studyIntent}`:
     * the route (or `null`) and what its view needs; fields a route does not use are `null` (plan 015 step 4c).
     */
    decision(q: string, state: any, rewrite: any): any;
    /**
     * `kb`: the manual rows (array); `programmes`: the programme rows (array) or null; `vocab`: a pack's vocab.json text, or omitted
     * for the embedded graduate-school pack (install happens once per process, before any route call).
     */
    constructor(kb: any, programmes: any, vocab?: string | null);
}

/**
 * The manual's own words cut into short points (port of chatbot.html `answerPoints`).
 */
export function answer_points(body: string): any;

/**
 * BLAKE3 of the UTF-8 bytes of `text`, as 64 hex chars. The page builds the answer receipt from it: the preimage (question, route, served
 * entry id + content, hash of the whole manual) is assembled in JS, hashed here, so one implementation hashes everything in the browser.
 */
export function blake3_text(text: string): string;

/**
 * `{kind: "personal", category, label}` for a personal/technical issue that needs staff, else `null` (port of `classifyIssue`).
 */
export function classify_issue(text: string): any;

/**
 * Classify a message as smalltalk. Returns the intent kind ("greet"/"thanks"/
 * "bye"/"whatcan"/"howareyou") or an empty string when it is NOT smalltalk
 * (a real question / complaint → kernel path). Sigmoid gate, argmax over gate.
 */
export function classify_smalltalk(text: string): string;

/**
 * What to do after the search: `{action: "act"|"disambiguate"|"escalate", stage: "reflex"|"rethink"}` (port of `decideTier`).
 * `gate` may be NaN when the kernel gave no gate score.
 */
export function decide_tier(gate: number, scores: Float64Array): any;

/**
 * Fee table of one programme as `{rows, notes}` (port of `_pFee`).
 */
export function fee_table(lines: string[]): any;

/**
 * Open-ended advice question (rephrase-worthy), not a factual lookup (port of `isAdvice`).
 */
export function is_advice(q: string): boolean;

/**
 * Latin letters and no Thai letters (port of `isEnglish`).
 */
export function is_english(q: string): boolean;

/**
 * Search a KB (passed as `[{id, keywords}]` JSON) for `query`. Returns a ranked
 * `[{id, s, cos, overlap}]`. The KB is small (tens–hundreds of entries) so a
 * per-call IDF build is microseconds; no caching needed across the wasm boundary.
 */
export function kb_search(kb: any, query: string): any;

/**
 * Route one task entirely in the browser. Returns a JSON object with the
 * decision + a reproducible BLAKE3 proof — no backend, no token cost on the
 * fast path. Mirrors the native Rust kernel's decision exactly.
 */
export function route_task(category: string, input: string, token_budget: number, priority: number): any;

/**
 * Admission schedule of one programme as `{cols, rows, notes, list}` (port of `_pSchedule`, data part).
 */
export function schedule_table(lines: string[]): any;

/**
 * The number a question asks for, taken from the answer (port of chatbot.html `slotLead`); "" when none.
 */
export function slot_lead(answer: string, question: string): string;

/**
 * Verify the phrases an AI wrote: `results[i]` = the search result of `phrases[i]` as `[{id, s}]` (best first, 3 are enough).
 * Returns `{kind: "one", id, score, via, others}`, `{kind: "many", ids}` or `{kind: "none"}` (port of `understand`).
 */
export function understand(phrases: string[], results: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_resolver_free: (a: number, b: number) => void;
    readonly __wbg_router_free: (a: number, b: number) => void;
    readonly answer_points: (a: number, b: number) => number;
    readonly blake3_text: (a: number, b: number, c: number) => void;
    readonly classify_issue: (a: number, b: number) => number;
    readonly classify_smalltalk: (a: number, b: number, c: number) => void;
    readonly decide_tier: (a: number, b: number, c: number) => number;
    readonly fee_table: (a: number, b: number) => number;
    readonly is_advice: (a: number, b: number) => number;
    readonly is_english: (a: number, b: number) => number;
    readonly kb_search: (a: number, b: number, c: number) => number;
    readonly resolver_new: (a: number, b: number) => void;
    readonly resolver_resolve: (a: number, b: number, c: number, d: number) => number;
    readonly route_task: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly router_decide: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly router_decision: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly router_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly schedule_table: (a: number, b: number) => number;
    readonly slot_lead: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly understand: (a: number, b: number, c: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
