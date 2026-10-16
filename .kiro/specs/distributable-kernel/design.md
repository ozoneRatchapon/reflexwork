# Design — Distributable Kernel & Federated Corpus

> Kiro spec-driven workflow · phase 2/3 (requirements → **design** → tasks)
> How R1–R6 are built, on top of what already exists in the repo.

## Guiding principle
The data boundary is the design. Everything inside an install is already built
(kernel, NLG, gap log with PII masking, EMA confidence, draft→approve). This
feature adds exactly two new things: a **packaging/scaffold layer** so the
inside can be reproduced elsewhere, and a **federated signal layer** that is the
*only* path across the network — carrying masked aggregates, never raw text.

```
  install A ── masked signals ──┐
  install B ── masked signals ──┤→  central corpus service  ──┐
  install C ── masked signals ──┘   (cluster → draft →         │
                                     HUMAN APPROVE → sign)      │
          ▲                                                     │
          └──────────── signed corpus release (pull) ───────────┘
```

## Components

### 1. `@reflexwork/kernel` (web) + `reflexwork-kernel` (crate) — R1
- Source of truth stays the Rust `reflex-wasm` crate already in the repo. The
  npm package is the existing `submissions/ui/wasm/` build + hand-written `.d.ts`
  for the `Decision` shape, published via `wasm-pack`/`wrangler`-agnostic output.
- The release pins **gate threshold θ**, the **feature order**, and the **BLAKE3
  domain string** in a `kernel.lock` embedded constant, so `route_task` is
  byte-reproducible for a given semver. A proof generated on install A verifies
  on install B of the same version.
- No telemetry code lives in the kernel package — the kernel stays a pure,
  offline decision function. Telemetry is a separate opt-in module (component 3).

### 2. `reflexwork init` scaffolder — R2
- A small CLI (Node, zero heavy deps) that copies a template tree: `kb/` (sample
  markdown + frontmatter), `build_knowledge_index` port, an edge handler
  (`worker.mjs`) importing `@reflexwork/kernel`, and the chat UI.
- Writes a `reflexwork.config.json` with `federation.enabled=false` and no
  endpoint — **private by default** (R2/R3). Telemetry is inert until the
  adopter fills in an endpoint AND flips the flag.

### 3. Federation client (opt-in signal layer) — R3
- A module in the install's edge worker, gated by `federation.enabled`.
- Reuses the EXISTING masking + gap-log aggregation (`integrations/_shared`): it
  does not read raw questions — it reads the already-masked, already-aggregated
  gap counts and the EMA confidence table.
- Emits three signal types, each a small JSON record:
  - `gap`  → `{ topic_key, count }` (topic_key = normalized n-gram bucket, NOT text)
  - `conf` → `{ entry_hash, delta }` (content hash of the KB entry, signed delta)
  - `route`→ `{ fast_path, llm, abstain }` counts for a window
- **Dry-run first (R3):** `federation preview` prints the exact next payload to
  stdout; nothing is sent until the maintainer has seen it. A signal whose source
  the mask flagged is dropped and logged, never sent.
- Transport: HTTPS POST to the configured central endpoint with the install's
  public-key id; batched, rate-limited, best-effort (a failed send never blocks
  the chatbot).

### 4. Central corpus service — R4
- A Worker + D1 (same stack as the kernel-worker) holding: `signals` (append,
  aggregate counts only — no user table, R-nongoal), `clusters`, `drafts`,
  `corpus_releases`.
- **Cluster:** group `gap.topic_key` across installs; when cross-install
  frequency crosses a threshold, raise a cluster to "candidate".
- **Draft:** reuse the learning-loop auto-draft (LLM grounded on existing public
  KB only) to propose an answer per candidate → PENDING. Never auto-publish (R4).
- **Approve + sign:** a human approves in a dashboard view; on approve the entry
  joins the next `corpus_release`, which is content-addressed and **signed**
  (R6) so installs can verify it.

### 5. Corpus pull + local merge — R5
- `reflexwork corpus pull` fetches the latest signed release, verifies the
  signature, and presents a **diff** (new/changed entries) for local review.
- Merge rules: a new entry is added on confirm; a changed entry that the install
  has edited locally is NOT overwritten silently — it is shown as a conflict for
  the maintainer to resolve. Each shared entry keeps `source_url` + the approving
  `corpus_version` for provenance (R5).

## Data shapes (new)
```jsonc
// outbound signal (the ONLY thing that leaves an install)
{ "kind": "gap", "topic_key": "thesis-submit-deadline", "count": 7,
  "install": "pub:ab12…", "window": "2026-10-16" }     // no raw text, ever

// central draft (pending human approval)
{ "cluster": "thesis-submit-deadline", "installs": 3, "count": 22,
  "draft_md": "---\ntitle: …\n---\n…", "status": "pending" }

// signed corpus release entry (pulled by installs)
{ "slug": "…", "md": "---\n…", "source_url": "https://…",
  "corpus_version": "2026.10.3", "sig": "ed25519:…" }
```

## Reuse map (what is NOT rebuilt)
| Need | Existing in repo |
|---|---|
| decision engine | `reflex-wasm` + `submissions/ui/wasm/` |
| PII masking | `integrations/_shared` + tests |
| gap aggregation | kernel-worker `/gap` + D1 |
| entry confidence (EMA) | kernel-worker learning-loop |
| auto-draft + approve | kernel-worker `kbAutodraft` / `/kb-draft` / approve |
| edge stack | Workers + D1 + Pages |

## Risks & mitigations
- **Topic_key leakage.** A too-specific key could re-identify a question →
  bucket keys coarsely (n-gram cluster), cap cardinality, drop singleton keys
  below a k-anonymity threshold before sending.
- **Bad central draft spreads.** Human approval + signed release + local review
  on pull = three gates before a wrong answer reaches users.
- **Install impersonation.** Each install has a keypair; central verifies the
  signal signature and installs verify the release signature.

## Decisions (ADR-style)
- **Federated signals, not centralized data** — the PDPA rule makes a data lake
  a non-starter; aggregate signals compound value without the raw data.
- **Kernel stays telemetry-free** — keeps the offline/auditable promise; sharing
  is an opt-in layer around it, not inside it.
- **Signed, pullable corpus artifact (not a hosted API per tenant)** — simpler,
  verifiable, and keeps installs in control of their own KB.
