# 001 - What the shared Rust router costs the LINE worker (plan 009 C4: "measure Workers cold start first")

Date: 2026-11-10. Machine: Apple M5 Pro, local workerd (`wrangler@4 check startup`) and Node (V8). Cloudflare's CPUs differ; read the numbers as relative.
Nothing here was deployed. The probe workers are named `coldstart-probe-*` and have no route.

## TL;DR
- **A KB decision took 7-9 ms of CPU, now 0.5-1 ms.** `route::Manual::search` rebuilt the whole TF-IDF index of the manual on every search
  (and a decision searches 1-2 times, plus once per AI phrase). The index is now built once in `Manual::new` (`src/kb_index.rs`); the
  ranking is unchanged (route contract 2268 checked / 0 differences, shadow 4629 same / 0 differ, `wasm_golden_check` 0 differences,
  e2e 46/46). The page also gets it: and it now keeps one Router instead of building one per turn (`routerFor` in `chatbot.html`).
- **LINE + router fits the Workers limits with a large margin.** Worst case (Router built at startup, with the 2.6 MB catalogue):
  ~19 ms startup CPU against a 1 s limit; 6.2 MB uncompressed against 64 MiB.
- **Build the Router at module scope (startup), not on the first message.** The build is ~10 ms (manual only) to ~19 ms (with the
  catalogue); on the Free plan a request has 10 ms of CPU, so a lazy build could fail the first message alone. Startup has its own 1 s limit.

## Limits used (developers.cloudflare.com/workers/platform/limits, page dated 2026-10-29)
Startup (global scope) 1 s, Free and Paid. Size: 64 MiB uncompressed, no compressed limit. CPU per HTTP request: Free 10 ms, Paid 30 s default.
The page does not say whether startup counts toward a request's CPU time.

## Results
### Node, `node benchmark/coldstart/router_cost.mjs`
| | before (per-search index) | after (index in `Manual::new`) |
|---|---|---|
| wasm compile + instantiate | 0.66 ms | 0.73 ms |
| `new Router(kb, programmes)` median | 3.07 ms | 5.33 ms (indexes the manual once) |
| `new Router(kb, [])` median | 0.22 ms | 2.50 ms |
| `decision` warm median (6 questions) | 7.42 ms | 0.58 ms |
| `decision` warm max | 9.18 ms | 1.22 ms |
| KB questions (`kb_act`, `english_off_corpus`) one by one | 6.8-9.2 ms | 0.5-1.0 ms |

Smalltalk and `generic_fee` questions did not change (0.01-0.05 ms: they never search the manual).
`cargo test -p reflex-wasm --test golden_route` (the whole contract, native): 20.0 s -> 3.0 s.

### Workers startup, `wrangler check startup --worker <bundle>` (3 runs each; the router built after the index change)
| probe | bundle (upload / gzip) | startup active CPU |
|---|---|---|
| `baseline.mjs` = the LINE worker today | 491 KiB / 91 KiB | 0.0 ms |
| `router_kb.mjs` = + router wasm + manual, Router built at startup, no catalogue | 1429 KiB / 369 KiB | 9.8-10.6 ms |
| `router.mjs` = + router wasm + manual + `programmes.json`, Router built at startup | 6244 KiB / 578 KiB | 18.0-19.1 ms |

Run (the probes were deleted after the port, when the real worker became the `router_kb.mjs` case; restore them with `git checkout 53e0a73 -- benchmark/coldstart/line_probe`): `cd benchmark/coldstart/line_probe && npx wrangler@4 deploy --dry-run --config wrangler.router.toml --outfile /tmp/b.bundle && npx wrangler@4 check startup --worker /tmp/b.bundle`
(`check startup --config ...` alone fails: it loses the config and looks for a Pages directory).

## What this does not show
- Times on Cloudflare's CPUs (local only).
- Which plan the LINE worker runs on (the 10 ms Free limit is the only one that matters here).
- Behaviour on the real LINE platform (the webhook is tested offline: tests/line_bot.test.mjs, tests/line_route.test.mjs).

## After the port (plan 009 C4, 2026-11-10): the real LINE worker on the Router
The worker now builds `new Router(KB, null)` at module scope from its own KB copy and decides every message with it; the second
wasm (`_shared/piimask`) is gone from LINE (the router wasm carries the same `mask_pii`). Measured on the real worker bundle
(`cd integrations/line-worker && npx wrangler deploy --dry-run --outfile /tmp/line_bundle.js && npx wrangler check startup --worker /tmp/line_bundle.js`):

| bundle | upload / gzip | startup active CPU (3 runs) |
|---|---|---|
| `integrations/line-worker` | 1003 KiB / 294 KiB | 25.5 ms (first run), 10.0 ms, 10.1 ms |

Active CPU = the profile's non-idle samples (sample spacing ~1.5 ms, so +-1.5 ms). The first run is a cold local start; the 1 s limit is far off either way.
