// @reflexwork/kernel — stable public surface over the WASM routing core.
//
// The wasm module IS the kernel (same algorithm as the native `reflex-kernel`
// crate: 64-dim features → sigmoid gate → BLAKE3 proof). This file only gives
// it a clean, typed, versioned API so a `route_task` decision is reproducible
// across every install of the same package version.
import initWasm, { route_task as _route_task } from './wasm/reflex_wasm.js';

/**
 * The gate threshold pinned into this release. A decision computed here is
 * reproducible on any install of the same @reflexwork/kernel version.
 * @type {number}
 */
export const GATE_THRESHOLD = 0.72;

/** Package/kernel version (kept in step with package.json). */
export const KERNEL_VERSION = '0.1.0';

let _ready = null;

/**
 * Load the WASM kernel once. Pass a custom wasm URL/bytes if you host the
 * `.wasm` yourself; omit to use the bundled binary.
 * @param {RequestInfo | URL | BufferSource | WebAssembly.Module} [moduleOrPath]
 * @returns {Promise<void>}
 */
export async function init(moduleOrPath) {
  if (!_ready) {
    _ready = moduleOrPath
      ? initWasm({ module_or_path: moduleOrPath })
      : initWasm();
  }
  await _ready;
}

/**
 * Route one task entirely locally — no backend, 0 token on the fast path.
 * `init()` must have resolved first.
 *
 * @param {string} category  task category, e.g. 'DataQuery' | 'Research' | 'DocumentParse' | 'CodeGen' | 'ComplianceCheck' | 'WorkflowOrchestration' | 'OnchainSettlement'
 * @param {string} input     the message / task text
 * @param {number} [tokenBudget=2048]
 * @param {number} [priority=128]  0..255
 * @returns {import('./index').Decision}
 */
export function routeTask(category, input, tokenBudget = 2048, priority = 128) {
  return _route_task(category, input, tokenBudget, priority);
}

// Keep the raw wasm-bindgen name available too, for parity with the in-repo build.
export { routeTask as route_task };
