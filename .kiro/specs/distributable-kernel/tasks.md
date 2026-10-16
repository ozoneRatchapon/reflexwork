# Tasks — Distributable Kernel & Federated Corpus

> Kiro spec-driven workflow · phase 3/3 (requirements → design → **tasks**)
> Ordered, verifiable implementation plan. Each task cites the requirement(s)
> it satisfies. Status: all PLANNED (this spec defines the next phase; it is not
> yet built).

## Phase A — Packaging (R1)
- [ ] A1. Carve the kernel into a publishable boundary: ensure `reflex-wasm`
  exposes only the stable `route_task` surface + `Decision` type. _(R1)_
- [ ] A2. Add `kernel.lock` embedded constants (θ, feature order, BLAKE3 domain)
  and a reproducibility test: same input+version → identical proof. _(R1)_
- [ ] A3. Produce `@reflexwork/kernel` (wasm-pack output + `.d.ts`) and a
  `reflexwork-kernel` crate; smoke-test `route_task` from a bare consumer app
  in both targets. _(R1)_
- [ ] A4. Semver + release notes; publish-dry-run (no real registry push until
  the owner approves). _(R1)_

## Phase B — Scaffolder (R2)
- [x] B1. `reflexwork init <name>` CLI: copy template tree (kb/, index builder,
  worker handler, chat UI). _(R2)_  → `packages/create-reflexwork/`
- [x] B2. Emit `reflexwork.config.json` with `federation.enabled=false`, no
  endpoint — private by default. _(R2, R3)_
- [ ] B3. Quickstart doc: install → init → build index → run locally. _(R2)_

## Phase C — Federation client / signal layer (R3)
- [x] C1. `federation` module that reads ONLY masked gap counts + EMA table
  (never raw questions); derive the three signal types. _(R3)_
  → `integrations/_shared/federation.mjs`
- [x] C2. k-anonymity guard: coarse topic_key bucketing, drop singleton/low-count
  keys, cap cardinality before any send. _(R3, R6)_
  → `K_ANON_MIN_HITS`, `MAX_GAP_BUCKETS`, `topicKey()` in federation.mjs
- [x] C3. `federation preview` dry-run that prints the exact next payload;
  nothing sends until invoked for real. _(R3)_
  → `GET /federation-preview` in kernel-worker (returns payload, sends nothing)
- [ ] C4. Batched, rate-limited, best-effort HTTPS sender keyed by the install's
  public-key id; a send failure never blocks the chatbot. _(R3)_
- [ ] C5. Per-install keypair generation + local "what I share / revoke" view.
  _(R6)_

## Phase D — Central corpus service (R4)
- [x] D1. Worker + D1 schema: `signals` (aggregate counts only, no user table),
  `drafts`, `corpus_entries`, `corpus_releases`. _(R4)_  → `integrations/corpus-service/`
- [x] D2. Signal ingest + server-side assertSafe (reject unmasked/text-like
  shapes); opaque `tk_` bucket ids only. _(R4, R6)_  → `POST /signal`
- [x] D3. Cluster: group topic_keys across installs; candidate at
  `CLUSTER_MIN_INSTALLS` distinct installs. _(R4)_  → `GET /clusters`
- [x] D4. `POST /draft` stores a PENDING draft per candidate; NO auto-publish
  path exists (only `/approve` can publish). _(R4)_
- [x] D5. `POST /approve` (human) → entry; `POST /release` cuts a
  content-addressed, HMAC-signed, Solana-anchored release. _(R4, R6)_

## Phase E — Corpus pull + local merge (R5)
- [x] E1. `GET /release/latest` returns the signed release + verify recipe
  (recompute sha256, check sig, confirm on-chain anchor). _(R5, R6)_
- [ ] E2. Diff + review UI: show new/changed entries; add on confirm. _(R5)_
- [ ] E3. Conflict guard: a locally-edited entry is never silently overwritten —
  surface as a conflict. _(R5)_
- [x] E4. Each released entry carries `source_url` + `corpus_version`. _(R5)_

## Phase F — Privacy & security hardening (R3, R6)
- [x] F1. Boundary test suite: assert NO raw text / user id / mask-flagged field
  can appear in any outbound payload (property test over the signal builder).
  _(R3, R6)_  → `tests/federation.test.mjs` (15/15, incl. the F1 leak tests)
- [ ] F2. Release signing + install-side verification end-to-end test. _(R6)_
- [ ] F3. Revocation: an install can stop sharing and prove nothing further is
  sent. _(R6)_

## Phase G — Docs & demo
- [ ] G1. `docs/distributable-kernel.md`: the data-boundary diagram + the opt-in
  contract, written for an adopter deciding whether to turn federation on.
- [x] G2. Two-install demo: A → signal → cluster → draft → HUMAN approve →
  signed release → B pulls + verifies. _(runnable: `demo/federated-corpus-demo.mjs`)_

## Verification gates
- Phase A/B done when a bare consumer app routes a message and a fresh scaffold
  provably makes zero network calls.
- Phase C/F done when the boundary property test passes: the signal builder
  cannot emit raw text under any input.
- Phase D/E done when the two-install demo (G2) closes the loop with a human
  approval in the middle and a verified signature on the pull.
