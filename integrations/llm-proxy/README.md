# ReflexWork — LLM proxy (Cloudflare Worker)

Holds the LLM API key as a **Worker secret** so it is never in the client, the
repo, or git history. The static demo pages call this proxy only for questions
the kernel escalated to the LLM path.

## Deploy

```bash
cd integrations/llm-proxy
npx wrangler deploy
# set the key as a secret (NOT in any file):
echo "YOUR_GEMINI_KEY" | npx wrangler secret put GEMINI_API_KEY
```

Then point a page at it:

```
https://reflexwork.pages.dev/chatbot.html?api=https://reflexwork-llm-proxy.<subdomain>.workers.dev
```

## Security properties

- **Key never leaves the Worker.** It is a runtime secret, not shipped to the
  browser and not committed. Rotating it is one `wrangler secret put`.
- **CORS locked** to the deployed site origin.
- **Per-IP rate limit** (token bucket, ~20 burst then 1 per 2s) blunts abuse
  and runaway cost. For a hardened deployment use a Durable Object or KV so the
  limit is shared across isolates.

## Guarding feedback abuse (the 👍/👎 loop)

The same concerns apply to the kernel's `/feedback` endpoint. Reasonable guards,
cheapest first:

1. **Clamp + rate limit** — reward is already clamped to [-1, 1]; add the same
   per-IP token bucket so one client cannot spam thousands of votes.
2. **One vote per answer** — the client already disables the buttons after a
   vote; enforce server-side with an answer id (BLAKE3 proof) so a replay of the
   same proof counts once.
3. **Bounded EMA step** — `ema_alpha` means any single vote moves the weights
   only a little; a burst of bad votes still cannot flip the gate instantly.
4. **Staff-weighted feedback** — in production, weight an authenticated staff
   👎 higher than an anonymous one, or require login for feedback to count.
5. **Audit every update** — each EMA update bumps `policy_version` and can carry
   a BLAKE3 proof, so a poisoning attempt is traceable and reversible (revert to
   a prior policy version).

The PoC implements (1) and (3); (2), (4), (5) are the path to production.
