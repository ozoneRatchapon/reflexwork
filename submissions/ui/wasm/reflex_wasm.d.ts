/* tslint:disable */
/* eslint-disable */

/**
 * Classify a message as smalltalk. Returns the intent kind ("greet"/"thanks"/
 * "bye"/"whatcan"/"howareyou") or an empty string when it is NOT smalltalk
 * (a real question / complaint → kernel path). Sigmoid gate, argmax over gate.
 */
export function classify_smalltalk(text: string): string;

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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly classify_smalltalk: (a: number, b: number, c: number) => void;
    readonly kb_search: (a: number, b: number, c: number) => number;
    readonly route_task: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
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
