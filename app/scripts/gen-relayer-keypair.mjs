#!/usr/bin/env node
/**
 * Generates a fresh ed25519 keypair for the platform withdrawal relayer.
 *
 *   node scripts/gen-relayer-keypair.mjs
 *
 * Outputs:
 *   - WITHDRAWAL_RELAYER_PUBKEY        (base58 public key)
 *   - WITHDRAWAL_RELAYER_SECRET_KEY    (base58 secret key, 64 bytes)
 *   - NEXT_PUBLIC_WITHDRAWAL_RELAYER_PUBKEY (mirrors the public key for the client)
 *
 * The secret key must be stored only as a Vercel encrypted environment
 * variable. Anyone holding it can sign refunds (capped per-user by the
 * server-side ledger), so treat it like a database password.
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
const pub = kp.publicKey.toBase58();
const secret = bs58.encode(kp.secretKey);

const out = `WITHDRAWAL_RELAYER_PUBKEY=${pub}
WITHDRAWAL_RELAYER_SECRET_KEY=${secret}
NEXT_PUBLIC_WITHDRAWAL_RELAYER_PUBKEY=${pub}
`;

process.stdout.write(out);
