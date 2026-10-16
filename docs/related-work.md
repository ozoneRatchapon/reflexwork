# Related work & credit — where ReflexWork sits

> ReflexWork did not invent the "decision ladder". It is built on a line of
> open work by **katopz** (`gist.rs` — Reflex / Instinct / Rethink) and was
> sharpened by reading the Thai-language field notes from **Megawiz / Asgard**.
> This page states what we borrowed, what we changed, and — in the spirit of
> that work — what we have NOT yet proven. Honesty first.

## The lineage

```
katopz · gist.rs (MIT)                 ReflexWork (this repo)
  R0 Reflex   — modelless, µs, abstain   →  Reflex Kernel (Rust/WASM, sigmoid
  R1 Instinct — trained specialist          gate θ, BLAKE3 proof, abstain)
  R3 Rethink  — encoder head (hosted)     →  4-way route + grounded-hybrid
  ...                                        + self-improving KB (human-approved)
Asgard / Megawiz (AGPL)                      + federated corpus (masked, Solana)
  reflex-study, ultra-instinct —
  the ladder re-implemented for Thai,
  with lessons we reuse below.
```

The core idea we share with both: **a cheap, deterministic layer answers what
it is sure of, abstains otherwise, and only escalates the rest** — each answer
carrying a receipt of which rung decided it.

## What ReflexWork borrows (and credits)

| Idea | Origin | In ReflexWork |
|---|---|---|
| modelless decision engine, µs, **abstain over guess** | Reflex (katopz) | the Reflex Kernel: sigmoid gate, no NN on the hot path |
| **the ladder** — pay only for what the lower rung can't answer | gist.rs | FastPath → grounded-hybrid → abstain/intake → LLM |
| **receipt / proof per answer** | Reflex | a reproducible BLAKE3 proof on every decision |
| **Thai n-gram tokenization** (whole Thai sentences vanish in an ASCII tokenizer) | Asgard lesson #2 | our KB search uses char n-grams, same fix |
| **structural response gate** (a system prompt is manners, not a wall) | Asgard katgpt-rs notes | `groundedGuard` strips any fact not in the KB |
| **"facts come from the corpus, the model only rephrases"** | Reflex / Asgard rulebook | grounded-hybrid prompt + the guard |

## Where ReflexWork differs

- **Domain & data boundary.** Asgard keeps *data* on the school's machines
  (medical/learner data); Rethink keeps *weights* on the provider's server.
  ReflexWork is a graduate-school help desk: PDPA-first, local-AI option, and a
  **federated corpus** that shares only *masked aggregate signals*, never raw
  text — a different protection than either.
- **Self-improving KB, human-gated.** We add a learning loop (gap log, entry
  confidence, auto-draft → **human approve**). This is deliberately *not* the
  naive "learn from your own answers" loop — see the warning below.
- **On-chain corpus anchoring.** Releases of the shared corpus are signed and
  their hash anchored on Solana (the repo's `workflow-escrow` program, live on
  devnet), so a release is verifiable across organisations that don't trust each
  other's servers. Neither Reflex nor Asgard needs this because they are
  single-org; a *federated* corpus does.

## Lessons we took to heart (and how we comply)

1. **"Default thresholds do not transfer — fit them from data."** (Reflex skill)
   — **We have NOT yet fit** our gate θ / KB-score cutoffs from labeled Thai
   data. They are reasoned defaults. This is our top honest caveat and a
   first-class next step, not a hidden assumption.
2. **"Letting a system learn from its own answers is a shortcut to invisible
   errors."** (Asgard lesson #6) — our learning loop therefore (a) never
   auto-publishes, (b) a human approves every draft, (c) KB entries, not model
   weights, change. We keep the 0-token promise *and* avoid the silent-error
   trap the field notes measured.
3. **Rulebook / clear definitions beat a bigger model.** (Asgard) — our KB
   markdown is the single source of truth; the model only rephrases from it.
4. **A structural gate, not a prompt, is what makes a guarantee.** — hence
   `groundedGuard`, which drops invented numbers/names regardless of model.
5. **Report n and confidence intervals; publish the results that lost.** — we
   adopt this norm: any accuracy number we cite will carry its sample size, and
   we state what is unverified.

## Honest status (what we have NOT proven)

- Thresholds are not yet fit from labeled data (lesson 1).
- We have no human-labeled Thai evaluation set yet; accuracy claims are
  architectural, not benchmarked.
- The federated corpus + on-chain anchor are implemented and demoed, not yet
  run across real separate organisations.

## Sources
- katopz — `gist.rs` (Reflex / Instinct / Rethink), `katgpt-rs`, `riir-reflex`,
  `riir-instinct` (MIT). The idea, the receipts culture, and the Thai-tokenizer
  warning are his.
- Megawiz / Asgard — engineering notes (AGPL): "แกะ Reflex …", "Ultra Instinct …",
  "Rethink กับบันไดเลื่อน", "ยืมสมอง NPC …" (asgard.megawiz.co.th/blog). The
  Thai-specific lessons and the learning-loop / data-leakage warnings are theirs.

Thank you to katopz for building and sharing this in the open, and to the
Megawiz/Asgard team for the field notes that made our ladder better.
