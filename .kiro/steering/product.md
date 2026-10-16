# Product Steering — ReflexWork

> Always-on context for every agent session. What this product IS and the rules
> that never change.

## What ReflexWork is
A **screening layer in front of an LLM** for a graduate-school help chatbot
(Mahidol). A deterministic Rust/WASM "Reflex Kernel" decides, per message,
whether it can be answered for **0 token in microseconds** (FastPath from a
verified KB) or must escalate. Every decision carries a reproducible BLAKE3
proof.

## Positioning (how to talk about it)
- NOT a replacement for staff or for the team's LLM — a **filter** that removes
  the ~80% of repeat/FAQ questions so the expensive LLM is used sparingly.
- Mirrors the "System One" idea (fast structured decisions that can't
  hallucinate) — see TypeSafe Jev and reflex.gist.rs as related work.
- Selling points, in order: **free + microsecond + auditable**, then **human
  language without AI** (template NLG + grounded hybrid), then **self-improving
  KB** (learning loop).

## Hard rules (never violate)
1. **Facts come from the KB, never from a generative model.** Numbers, phones,
   steps = FastPath/grounded only. A model may rephrase, never invent.
2. **Abstain over guess.** Low confidence / off-corpus → say so + route to staff.
3. **PDPA: no PII leaves the machine.** Mask PII in logs; local AI keeps data
   on-box; never commit PII to the public repo.
4. **No auto-publish of KB.** Drafts need human approval.
5. **No model retrain.** Improve the corpus (KB), not weights — keeps 0-token.
