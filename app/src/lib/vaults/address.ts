import { PublicKey } from "@solana/web3.js";

// Memo program is used as the deterministic seed authority for the pool PDA.
// We don't have a custom on-chain program yet — the PDA simply gives us a real,
// valid, deterministic Solana pubkey to identify the pool by. The launch
// transaction itself is the on-chain memo recording the pool config.
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

const SEED_PREFIX = "phoenix-vault";
const MAX_VAULT_INDEX = 255;

/**
 * Derives the deterministic pool PDA for a manager + vault index.
 * The PDA is a real Solana pubkey (32-byte base58) that any client can
 * recompute from (manager, vaultIndex).
 */
export function derivePoolAddress(
  manager: PublicKey,
  vaultIndex: number
): { address: PublicKey; bump: number; vaultIndex: number } {
  const idx = Math.max(0, Math.min(MAX_VAULT_INDEX, Math.floor(vaultIndex)));
  const [address, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEED_PREFIX),
      manager.toBuffer(),
      Buffer.from([idx]),
    ],
    MEMO_PROGRAM_ID
  );
  return { address, bump, vaultIndex: idx };
}

/**
 * Picks the next available vault index for a manager, given a set of
 * already-known pool addresses to avoid collisions. Walks from 0..255.
 */
export function nextVaultIndex(
  manager: PublicKey,
  knownPoolAddresses: string[]
): { address: PublicKey; bump: number; vaultIndex: number } {
  const known = new Set(knownPoolAddresses);
  for (let i = 0; i <= MAX_VAULT_INDEX; i++) {
    const derived = derivePoolAddress(manager, i);
    if (!known.has(derived.address.toBase58())) {
      return derived;
    }
  }
  // Fallback: just return slot 0 (shouldn't happen in practice).
  return derivePoolAddress(manager, 0);
}
