# Solana deployment — workflow-escrow (live on devnet)

The `workflow-escrow` Anchor program is **deployed and live on Solana devnet**.
It is what anchors a federated-corpus release's content hash on-chain, so a
release is verifiable across organisations (see `integrations/corpus-service`).

| | |
|---|---|
| Program ID | `6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5` |
| Cluster | devnet |
| Owner | BPFLoaderUpgradeab1e11111111111111111111111 |
| ProgramData | `8KRmuSRg73ss4a68tLKrTo8o3TPjHsn4drfDRA7qmM5A` |
| Data length | 210,560 bytes |
| Last deploy tx | `8n6j745Eb7xJ1H9dbfjhDLxh7FfRg1n6sU9pwrtaYEqJGhQayCbMwNKCZWG9HmX8KB7xKqptnEiSVJ1HRF8iAhY` |
| IDL | initialized on-chain |

Verify:
```bash
solana program show 6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5 --url devnet
```
Explorer: https://explorer.solana.com/address/6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5?cluster=devnet

## How it fits the corpus loop
1. `corpus-service` cuts a signed, content-addressed release.
2. It POSTs the `content_hash` to the `anchor-webhook` signer (holds the
   authority keypair — never the public Worker).
3. The signer submits a `submit_execution_proof` instruction to THIS program;
   the attestation PDA is `[ "attest", content_hash ]`.
4. A pulling install verifies the hash it downloaded is anchored on-chain.

Rebuild/redeploy: `anchor build && anchor deploy --provider.cluster devnet`
(needs the Solana + Anchor CLI and a funded devnet keypair).
