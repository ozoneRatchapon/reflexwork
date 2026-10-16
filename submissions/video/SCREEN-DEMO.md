# ReflexWork screen demo (real, live) — 20s, full loop

A 20s screen recording of the **live chatbot + dashboard**, proving the engine
works end to end — not a mockup. It walks the whole decision loop:

1. **FastPath** — a factual question → kernel routes FastPath, answered in
   microseconds at **0 token**, with a reproducible **BLAKE3 proof** and the
   live sigmoid gate readout (θ=0.72, complexity, g-score).
2. **Abstain** — an off-corpus / personal question ("ขอเบอร์ส่วนตัวของคณบดี")
   → the kernel does NOT guess; it shows a rethink/abstain path instead of
   inventing an answer.
3. **Learning signal** — 👎 on a FastPath answer nudges the visible FastPath
   ratio (the learning loop made visible to the user).
4. **Dashboard** — route distribution (FastPath / LLM / Rejected) + the
   **Audit Trail**: every decision with its BLAKE3 proof, re-runnable.

## Provenance
- recorded from `reflexwork.pages.dev/chatbot.html` + `/dashboard.html`
  (Cloudflare Pages, the live deploy of this repo's `submissions/ui/`)
- driven by Playwright (chromium-core) against the **real server + WASM kernel**,
  no fixtures, no mocks
- the chatbot carries the micro-animation build (merged to main)

Files: `reflexwork-screen-demo.mp4`, `reflexwork-screen-demo.gif`.
