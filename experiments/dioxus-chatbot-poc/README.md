# Dioxus chatbot PoC — feasibility verdict

A **feasibility probe**, not a rewrite. Question: should the ReflexWork chatbot UI
be rewritten from HTML+JS to **Dioxus** (Rust → WASM), following the
`/Users/ozone/karaoke` pattern (`dx build` → `dist/` → `wrangler` assets +
`run_worker_first:["/api/*"]`)?

## What this PoC proves (measured, not guessed)

✅ **It builds.** `dx build --release --platform web` compiles 175 crates, runs
wasm-bindgen, and produces a working web bundle. The full-Rust UI path is viable;
the toolchain (`dx 0.7.10`, arm64) is already on this machine.

✅ **The UI ports cleanly.** The real chatbot shell — nav, kernel-decision strip,
reactive message list, ask row, smalltalk/FastPath reply — expresses naturally as
typed Dioxus components with `use_signal` reactive state. No HTML/JS string
juggling; the kernel-strip is a typed component, not a template literal.

✅ **One Rust codebase.** The real app would `reflex-wasm = { path = ... }` and call
`kb_search` / `classify_smalltalk` / `route_task` directly — the same functions
step #1 moved into the kernel crate. No JS ⇄ Rust logic drift at all.

## The tradeoff (the number that decides it)

| build | payload |
|---|---|
| current `chatbot.html` (HTML + inline JS) | **67 KB** |
| Dioxus PoC (wasm + glue js) | **~865 KB** (808 KB wasm + 57 KB js) |

**~13× larger** for the same page. First paint waits on a ~0.8 MB wasm download +
instantiate (vs 67 KB that renders immediately). For a hackathon demo a judge opens
cold on a phone, that first-load cost is real and user-visible.

## Verdict

- **Full-Rust UI is VIABLE and buys real things** — type-safe components, one Rust
  codebase end-to-end, the "100% Rust" story — but it is a **multi-day rewrite of 5
  pages** with a **~13× payload cost**, which matters most exactly when a judge first
  opens the demo.
- **Recommendation: NOT before the 17 Oct submit.** Ship the current HTML+JS UI
  (fast first paint) with the **kernel logic already unified in Rust** (step #1 —
  done). Keep this PoC as the post-hackathon starting point: the build works, the
  component model fits, and the payload can be trimmed (feature-gate `dioxus`,
  `opt-level="z"`, split the big pages) before committing to the rewrite.

## Build it

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cd experiments/dioxus-chatbot-poc
dx build --release --platform web     # → dist bundle (wasm + js + index.html)
dx serve                               # local dev with hot reload
```
