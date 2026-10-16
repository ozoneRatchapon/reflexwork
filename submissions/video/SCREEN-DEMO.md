# ReflexWork screen demo (real, live)

A 16s screen recording of the **live chatbot** answering real questions, proving
the engine works end to end — not a mockup.

What it shows:
- two factual questions → kernel routes to **FastPath**, answered in **~400–2900 µs**
  at **0 token**, each with a reproducible **BLAKE3 proof**;
- the real sigmoid gate readout (θ=0.72, complexity, g-score);
- an advice question → grounded-hybrid / abstain path.

## Provenance
- recorded from `reflexwork.pages.dev/chatbot.html` (Cloudflare Pages, the live
  deploy of this repo's `submissions/ui/`)
- driven by Playwright (chromium-core) against the **real server + WASM kernel**,
  no fixtures, no mocks
- base branch content: `feat/chatbot-ui-polish` (the micro-animation build)

Files: `reflexwork-screen-demo.mp4`, `reflexwork-screen-demo.gif`.
