/* tslint:disable */
/* eslint-disable */

/**
 * Unix ms -> UTC day number.
 */
export function day_of(unix_ms: number): number;

/**
 * `days`: JSON `[{day, up, down}]` of one entry; `fixed_at`: Unix ms of the fix -> before / after as JSON.
 */
export function fix_effect(days: string, fixed_at: number): string;

/**
 * `rows`: JSON `[{id, up, down, reasons: {wrong, off_topic, outdated, incomplete}, last_fix_at}]` -> the queue as JSON.
 */
export function fix_queue(rows: string): string;

/**
 * The reason code if `s` is exactly one of `wrong | off_topic | outdated | incomplete`, else `undefined`.
 */
export function parse_reason(s: string): string | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly day_of: (a: number) => number;
    readonly fix_effect: (a: number, b: number, c: number, d: number) => void;
    readonly fix_queue: (a: number, b: number, c: number) => void;
    readonly parse_reason: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
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
