import "server-only";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

let cached: Keypair | null = null;

function decodeSecret(secret: string): Uint8Array {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as number[];
      if (Array.isArray(arr) && arr.length === 64) return Uint8Array.from(arr);
    } catch {
      throw new Error("Invalid relayer JSON secret key");
    }
  }
  try {
    const bytes = bs58.decode(trimmed);
    if (bytes.length === 64) return bytes;
    throw new Error(`Expected 64 bytes, got ${bytes.length}`);
  } catch (e) {
    throw new Error(
      `Could not decode WITHDRAWAL_RELAYER_SECRET_KEY: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

export function getRelayerKeypair(): Keypair {
  if (cached) return cached;
  const secret = process.env.WITHDRAWAL_RELAYER_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "WITHDRAWAL_RELAYER_SECRET_KEY is not configured. Generate a keypair with `node scripts/gen-relayer-keypair.mjs` and add it to the environment."
    );
  }
  cached = Keypair.fromSecretKey(decodeSecret(secret));
  return cached;
}

export function getRelayerPublicKey(): PublicKey {
  const explicit = process.env.WITHDRAWAL_RELAYER_PUBKEY;
  if (explicit) {
    try {
      return new PublicKey(explicit.trim());
    } catch {
      // fall through to derive
    }
  }
  return getRelayerKeypair().publicKey;
}

export function isRelayerConfigured(): boolean {
  return !!process.env.WITHDRAWAL_RELAYER_SECRET_KEY;
}
