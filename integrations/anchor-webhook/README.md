# anchor-webhook — Solana signer for the federated corpus

The one place a private key lives. The public `corpus-service` Worker POSTs a
release's `content_hash` here; this service signs a `submit_execution_proof`
instruction against the deployed `workflow-escrow` program and returns the tx —
so a corpus release's hash is anchored on-chain and verifiable across orgs.

## Prerequisites (your machine — the agent cannot install these)

```bash
# 1) Solana CLI + Anchor (one-time)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"     # solana
cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install latest && avm use latest  # anchor

# 2) a funded devnet keypair
solana-keygen new -o ~/.config/solana/reflex-signer.json
solana config set --url devnet --keypair ~/.config/solana/reflex-signer.json
solana airdrop 2
```

## Deploy the program (once)

```bash
cd /Users/ozone/projects/ReflexWork       # repo root (has programs/workflow-escrow)
anchor build
anchor deploy --provider.cluster devnet
# note the deployed program id; it must match declare_id! in
# programs/workflow-escrow/src/lib.rs (6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5)
```

## Run the signer

```bash
cd integrations/anchor-webhook
npm install
SOLANA_RPC=https://api.devnet.solana.com \
PROGRAM_ID=6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5 \
SIGNER_KEYPAIR_PATH=~/.config/solana/reflex-signer.json \
WEBHOOK_TOKEN=some-shared-secret \
npm start
# → anchor-webhook → http://127.0.0.1:8799/anchor
```

Then point the corpus-service at it:
```bash
cd ../corpus-service
npx wrangler secret put ANCHOR_WEBHOOK      # e.g. https://<your-tunnel>/anchor
```

## Honest status

- The signer code is complete and matches the program's instruction + PDA seeds
  (`submit_execution_proof`, `[ "attest", hash ]`). The account-metas list is the
  minimal set; if `anchor build` shows `SubmitExecutionProof` needs more accounts,
  extend the `keys` array to match (the program is the source of truth).
- Until the program is deployed and this service is running + reachable by the
  Worker, `corpus-service` records releases as `anchor_tx='unanchored'` — on
  purpose, so a demo works and nothing fakes a transaction.
- This service listens on 127.0.0.1; expose it to the Worker via a tunnel
  (ngrok / Cloudflare Tunnel), same as the local-AI path. Never run it on the
  public edge — that would put the key there.
