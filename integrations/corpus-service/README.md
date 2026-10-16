# reflexwork-corpus — central federated-corpus service (Phase D)

The hub of the federated corpus: many private installs send **masked signals**,
this service turns a cross-install gap into a **human-approved** KB entry, and
publishes a **signed, Solana-anchored** release that installs pull and verify.

No install's raw data is here — the service holds aggregate counts, drafts, and
the shared corpus. **There is no per-user table.**

## The loop

```
  install A ─┐                                   ┌─ install B pulls
  install B ─┤ masked signals (tk_ buckets +     │  the signed release,
  install C ─┘ counts, NO text)  ─► /signal      │  verifies sig + on-chain
                                      │           │  anchor, reviews the diff
                                 /clusters        │  locally, merges
                            (≥N distinct installs)│
                                      │           │
                                  /draft  ──► PENDING (grounded on public KB)
                                      │
                                  /approve  ◄── HUMAN (no auto-publish)
                                      │
                                  /release  ──► content-addressed + SIGNED
                                      │          + hash anchored on Solana
                                      └──────────► /release/latest
```

## Why Solana (an honest answer)

Three trust questions a cross-organisation corpus has, that a signature alone
does not settle — because the organisations do not trust each other's servers:

1. **Is this release authentic and unaltered?** The release `content_hash` is
   anchored on Solana (submitted as an attestation via ReflexWork's existing
   `workflow-escrow` program + `StateAttestation` path). An install verifies the
   hash it downloaded matches the on-chain record — tamper-evident across orgs.
2. **Did an install really contribute, or spam?** Contributions can carry a
   proof-of-contribution attestation (same mechanism), and the program's
   reputation counter (already in `programs/workflow-escrow`) rate-limits bad
   actors.
3. **Which corpus version is canonical?** The on-chain anchor is the shared,
   append-only source of truth for "release X existed with hash Y at time Z" —
   no single org's database can rewrite it.

This reuses what the repo already has (the Solana code predates the Mahidol
pivot); it is not blockchain bolted on for its own sake. The anchor is the one
place a federated, mutually-distrustful network needs a neutral ledger.

## Anchoring is optional and honest

`anchorOnSolana` calls a configured `ANCHOR_WEBHOOK` (a small signer service
holding the program authority key — the Worker never holds a private key). When
`ANCHOR_WEBHOOK` is unset, a release is recorded with `anchor_tx='unanchored'`
and says so — a local demo works without a chain, and nothing fakes a tx.

## Endpoints
| Method | Path | What |
|---|---|---|
| POST | `/signal` | ingest one install's masked payload (assertSafe re-checked server-side) |
| GET | `/clusters` | hot gap clusters (≥ `CLUSTER_MIN_INSTALLS` distinct installs) |
| POST | `/draft` | author a PENDING draft for a cluster (staff-gated) |
| GET | `/drafts` | list drafts |
| POST | `/approve` | HUMAN approval → entry joins the next release (staff-gated) |
| POST | `/release` | cut a signed, content-addressed, anchored release (staff-gated) |
| GET | `/release/latest` | the signed release installs pull + verify |

## Deploy
```bash
cd integrations/corpus-service
npx wrangler d1 create reflexwork-corpus      # paste the id into wrangler.toml
npx wrangler secret put STAFF_TOKEN
npx wrangler secret put RELEASE_SIGNING_KEY
# optional, enables on-chain anchoring:
npx wrangler secret put ANCHOR_WEBHOOK
npx wrangler deploy
```

Part of the `distributable-kernel` spec — see `.kiro/specs/distributable-kernel/`.
