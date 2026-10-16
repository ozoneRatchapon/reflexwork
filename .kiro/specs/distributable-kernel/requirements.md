# Requirements — Distributable Kernel & Federated Corpus

> Kiro spec-driven workflow · phase 1/3 (requirements → design → tasks)
> Feature: package the Reflex Kernel for other teams to install, and let many
> installs improve ONE shared corpus — without any raw data leaving a machine.

## Problem statement
ReflexWork today is one deployment for one faculty. The kernel (Rust/WASM), the
NLG, and the learning loop are generic — any help desk with an FAQ could use
them. But two things block adoption and compounding value:

1. **Distribution.** There is no way for another team to `install` the kernel
   and stand up their own FastPath chatbot over their own KB.
2. **Isolated learning.** Each install's learning loop (gap log, entry
   confidence) improves only its own KB. Faculty A re-discovers a gap Faculty B
   already closed. The corpus does not compound across installs.

The hard constraint from the product's rules (never violated): **no PII leaves
the machine**, **no auto-publish**, **no model retrain**. So a shared corpus
must be built from *masked signals and human-approved drafts*, never from raw
user questions — federated like the learning loop, not centralized like a data
lake.

## User stories & acceptance criteria (EARS)

### R1 — Install the kernel as a library
As a developer at another team, I want to install the kernel and route messages
in my own app, so I can build a FastPath chatbot without reimplementing it.
- THE SYSTEM SHALL publish the kernel as an installable package for web
  (`@reflexwork/kernel`, WASM + JS types) and for Rust (a crate).
- THE SYSTEM SHALL expose a stable `route_task(kind, text, …) -> Decision`
  surface (route, fast_path, gate_score, complexity, blake3_proof) identical to
  the in-repo WASM build, so a decision is reproducible across installs.
- THE SYSTEM SHALL version the package with semver and pin the gate threshold
  and feature order in the release, so the same input gives the same proof for a
  given version.

### R2 — Scaffold a new deployment
As a new adopter, I want one command to lay down a working skeleton, so I can
go from install to a running bot over my own KB quickly.
- WHEN the adopter runs the scaffolder (`reflexwork init <name>`), THE SYSTEM
  SHALL generate: a KB folder (markdown + frontmatter), the index builder, a
  worker/edge handler wired to the kernel, and a minimal chat UI.
- THE SYSTEM SHALL ship with telemetry OFF and no network egress configured, so
  a fresh install is private by default.

### R3 — Opt-in, masked telemetry (the only thing that may leave)
As an adopter, I want to contribute to the shared corpus WITHOUT exposing my
users' questions.
- THE SYSTEM SHALL keep federated contribution DISABLED by default; it is
  enabled only by an explicit opt-in config flag.
- WHERE telemetry is enabled, THE SYSTEM SHALL transmit ONLY: (a) gap entries as
  a normalized topic key + count (never the raw question text), (b) KB entry
  confidence deltas keyed by a content hash, (c) route distribution counts.
- THE SYSTEM SHALL run the existing PII mask BEFORE deriving any transmitted
  signal, and SHALL drop a signal it cannot confidently mask rather than send
  it.
- THE SYSTEM SHALL make every outbound payload inspectable (a local "what would
  be sent" dry-run) before the first real send.

### R4 — Central corpus builds drafts, humans approve
As the corpus maintainer, I want cross-install gaps turned into candidate KB
entries that any install can adopt — still human-gated.
- WHEN the central service receives gap signals above a frequency threshold
  across installs, THE SYSTEM SHALL cluster them by topic key and raise a
  candidate for authoring.
- THE SYSTEM SHALL auto-draft a candidate answer (LLM) grounded only on existing
  public KB material, as a PENDING draft — NEVER auto-published.
- WHEN a human approves a central draft, THE SYSTEM SHALL publish it to a
  versioned public corpus channel that installs can pull.

### R5 — Installs pull corpus updates safely
As an adopter, I want to benefit from the shared corpus without losing control
of my own KB.
- WHEN an install pulls a corpus update, THE SYSTEM SHALL present new/changed
  entries for local review and SHALL NOT overwrite a locally-edited entry
  without the maintainer's confirmation.
- THE SYSTEM SHALL keep facts sourced and attributable (each shared entry
  carries its source + the approving corpus version).

### R6 — Security, privacy, provenance
- THE SYSTEM SHALL sign central corpus releases so an install can verify
  authenticity before pulling.
- THE SYSTEM SHALL keep the opt-in contract auditable: an install can see, and
  revoke, exactly what it shares.
- THE SYSTEM SHALL NEVER transmit raw message text, user identifiers, or
  anything the mask flagged — this is the product's PDPA rule applied to the
  network boundary.

## Non-goals
- No raw-text or transcript sharing, ever — masked aggregate signals only.
- No model fine-tuning / retrain (corpus-driven only; keeps the 0-token promise
  on every install).
- No auto-approval of drafts, central or local — a human always approves.
- No central store of per-user data — the central service holds corpus +
  aggregate counts, not a user table.
- Not a multi-tenant SaaS in this phase — the central corpus is a signed,
  pullable artifact, not a hosted per-tenant backend.
