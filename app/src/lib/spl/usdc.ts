/**
 * Isomorphic USDC helpers — pure constants + sync derivations only.
 *
 * Server routes and client components both import from here. Any code path
 * that needs a live RPC round-trip (`getAccount`, balance fetch, full transfer)
 * lives in `./usdc-client.ts` so the heavy `@solana/spl-token` runtime is
 * tree-shaken out of the server bundle (where serverless minification has
 * been known to mangle the spl-token exports).
 */

import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// Devnet USDC (Circle test mint commonly used by Phoenix devnet).
export const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const USDC_DECIMALS = 6;

export type ClusterKind = "mainnet" | "devnet" | "testnet" | "unknown";

export function clusterFromRpc(url: string): ClusterKind {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  if (
    url.includes("mainnet") ||
    url.includes("mainnet-beta") ||
    url.includes("helius-rpc.com")
  )
    return "mainnet";
  return "unknown";
}

export function usdcMintFor(cluster: ClusterKind): PublicKey {
  return cluster === "devnet" ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

export function toUsdcLamports(uiAmount: number): bigint {
  if (!Number.isFinite(uiAmount) || uiAmount <= 0) return BigInt(0);
  // Round to 6 decimals to avoid FP drift
  return BigInt(Math.round(uiAmount * 1_000_000));
}

export function fromUsdcLamports(amount: bigint | number | string): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000;
}

export function deriveUsdcAta(
  owner: PublicKey,
  cluster: ClusterKind = "mainnet"
): PublicKey {
  return getAssociatedTokenAddressSync(
    usdcMintFor(cluster),
    owner,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}
