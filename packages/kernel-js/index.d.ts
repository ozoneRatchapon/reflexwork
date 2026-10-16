// Type definitions for @reflexwork/kernel

/** The kernel's per-message decision + reproducible proof. */
export interface Decision {
  /** Chosen route: 'FastPath' | 'McpAnalyze' | 'McpSynthesize' | 'Rejected'. */
  route: string;
  /** True when answered from the verified KB for 0 token. */
  fast_path: boolean;
  /** BLAKE3(input || route || category), hex — same input+version → same proof. */
  blake3_proof: string;
  /** Human-readable token cost note. */
  token_cost: string;
  /** Feature dim 8: input complexity in [0,1]. */
  gate_dim8_complexity: number;
  /** Raw sigmoid gate score g in [0,1] (higher = more "needs LLM"). */
  gate_score: number;
}

/** The gate threshold pinned into this release. */
export declare const GATE_THRESHOLD: number;

/** Package/kernel version. */
export declare const KERNEL_VERSION: string;

/**
 * Load the WASM kernel once. Pass a custom wasm URL/bytes to self-host the
 * `.wasm`; omit to use the bundled binary.
 */
export declare function init(
  moduleOrPath?: RequestInfo | URL | BufferSource | WebAssembly.Module
): Promise<void>;

/**
 * Route one task entirely locally — no backend, 0 token on the fast path.
 * `init()` must have resolved first.
 */
export declare function routeTask(
  category: string,
  input: string,
  tokenBudget?: number,
  priority?: number
): Decision;

/** Alias of {@link routeTask}, matching the raw wasm-bindgen export name. */
export declare const route_task: typeof routeTask;
