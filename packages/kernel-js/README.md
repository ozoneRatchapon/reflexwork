# @reflexwork/kernel

The **ReflexWork Reflex Kernel** as a library. A deterministic routing gate that
decides, per message, whether it can be answered on the **FastPath (0 token, in
the browser/edge)** or must escalate to an LLM — and returns a **reproducible
BLAKE3 proof** of that decision. No backend, no token cost on the fast path.

Same algorithm as the native `reflex-kernel` Rust crate (64-dim feature encoding
→ sigmoid gate → seeded weights → BLAKE3), compiled to WASM.

## Install

```bash
npm install @reflexwork/kernel
```

## Use

```js
import { init, routeTask, GATE_THRESHOLD } from '@reflexwork/kernel';

await init();                       // load the wasm once (bundled binary)

const d = routeTask('DataQuery', 'ส่งรูปเล่มภายในกี่วัน');
// {
//   route: 'FastPath',
//   fast_path: true,               // answer from your KB for 0 token
//   blake3_proof: 'a1b2…',         // same input + version → same proof
//   token_cost: '0 tokens (deterministic — no LLM)',
//   gate_dim8_complexity: 0.11,
//   gate_score: 0.059              // < GATE_THRESHOLD (0.72) ⇒ FastPath
// }

if (d.fast_path) {
  // answer from your own verified KB — the kernel only DECIDES, it never invents
} else {
  // hand d + the message to your LLM path
}
```

### Self-hosting the wasm

The `.wasm` is bundled. To serve it yourself (e.g. a CDN path), pass it to
`init`:

```js
await init('/assets/reflex_wasm_bg.wasm');          // URL
// or
await init(fetchedArrayBuffer);                     // bytes / WebAssembly.Module
```

## What it is (and is not)

- **Is:** a fast, offline, auditable *decision function*. Deterministic — the
  same input on the same package version yields the same route and the same
  proof, so a decision made in one place verifies in another.
- **Is not:** a generative model. It never produces an answer. Facts come from
  **your** KB on the FastPath; the LLM path is yours to wire. This is the whole
  point — the kernel removes the repeat/FAQ load so the expensive LLM is used
  sparingly, and it cannot hallucinate because it does not generate.

## API

| Export | Description |
|---|---|
| `init(moduleOrPath?)` | Load the wasm once. Optional custom wasm URL/bytes. |
| `routeTask(category, input, tokenBudget?, priority?)` | Route one task → `Decision`. |
| `route_task` | Alias of `routeTask` (raw wasm-bindgen name). |
| `GATE_THRESHOLD` | The gate θ pinned into this release (`0.72`). |
| `KERNEL_VERSION` | Package/kernel version. |

`category` is one of: `DataQuery`, `Research`, `DocumentParse`, `CodeGen`,
`ComplianceCheck`, `WorkflowOrchestration`, `OnchainSettlement` (anything else
falls to a generic bucket).

## Reproducibility

The gate threshold, feature order and BLAKE3 domain are fixed per release. Two
installs of the same version produce byte-identical proofs for the same input —
that is what makes a FastPath decision auditable after the fact.

## License

MIT OR Apache-2.0. Part of [ReflexWork](https://reflexwork.pages.dev).
