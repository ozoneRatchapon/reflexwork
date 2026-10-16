// anchor-webhook — the Solana signer service for the federated corpus.
//
// The corpus-service Worker cannot hold a private key (and should not), so when
// it cuts a release it POSTs the release content_hash here. THIS service holds
// the signer keypair, builds a `submit_execution_proof` instruction against the
// deployed `workflow-escrow` program, and anchors the hash on-chain — returning
// the tx signature the Worker records as `anchor_tx`.
//
// This is the ONE place a private key lives, isolated from the public Worker.
// Run it somewhere you control (a small box / a container), never in the edge.
//
//   POST /anchor { task_spec_hash: "<64-hex>" }  ->  { tx: "<signature>" }
//
// Env:
//   SOLANA_RPC            e.g. https://api.devnet.solana.com
//   PROGRAM_ID            6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5 (from the program)
//   SIGNER_KEYPAIR_PATH   path to the funded keypair json (devnet SOL)
//   WEBHOOK_TOKEN         shared secret the Worker sends as X-Anchor-Token
//
// Deps (install where you run it): @solana/web3.js @coral-xyz/anchor
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '6Dzv8va1Se8HisK5ceDw62sRxMWyD693AyP1hfSUtYE5');
const TOKEN = process.env.WEBHOOK_TOKEN || '';
const SEED_ATTEST = Buffer.from('attest');

// Anchor instruction discriminator = sha256("global:<name>")[0..8]
function discriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function loadSigner() {
  const path = process.env.SIGNER_KEYPAIR_PATH;
  if (!path) throw new Error('SIGNER_KEYPAIR_PATH not set');
  const secret = Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')));
  return Keypair.fromSecretKey(secret);
}

function hexToBytes(hex) {
  const clean = String(hex).replace(/[^0-9a-f]/gi, '');
  if (clean.length !== 64) throw new Error('task_spec_hash must be 32-byte hex (64 chars)');
  return Uint8Array.from(clean.match(/../g).map(h => parseInt(h, 16)));
}

async function anchorHash(hashHex) {
  const conn = new Connection(RPC, 'confirmed');
  const signer = loadSigner();
  const hash = hexToBytes(hashHex);

  // attestation PDA = [ "attest", composite_hash ]
  const [attestPda] = PublicKey.findProgramAddressSync([SEED_ATTEST, Buffer.from(hash)], PROGRAM_ID);

  // submit_execution_proof(composite_hash: [u8;32]) — minimal anchor:
  // discriminator || 32-byte hash. (Account metas must match the program's
  // SubmitExecutionProof context; adjust if the program expects more.)
  const data = Buffer.concat([discriminator('submit_execution_proof'), Buffer.from(hash)]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: attestPda, isSigner: false, isWritable: true },
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system program
    ],
    data,
  });
  const tx = new Transaction().add(ix);
  const sig = await conn.sendTransaction(tx, [signer]);
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

createServer((req, res) => {
  if (req.method !== 'POST' || new URL(req.url, 'http://x').pathname !== '/anchor') {
    res.statusCode = 404; return res.end('POST /anchor { task_spec_hash }');
  }
  if (TOKEN && req.headers['x-anchor-token'] !== TOKEN) {
    res.statusCode = 401; return res.end(JSON.stringify({ error: 'bad token' }));
  }
  let body = ''; req.on('data', c => body += c); req.on('end', async () => {
    try {
      const { task_spec_hash } = JSON.parse(body || '{}');
      const tx = await anchorHash(task_spec_hash);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ tx, explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet` }));
    } catch (e) {
      res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
}).listen(Number(process.env.PORT || 8799), '127.0.0.1',
  () => console.log(`anchor-webhook → http://127.0.0.1:${process.env.PORT || 8799}/anchor  (program ${PROGRAM_ID.toBase58()})`));
