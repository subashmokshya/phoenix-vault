"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  USDC_DECIMALS,
  clusterFromRpc,
  deriveUsdcAta,
  usdcMintFor,
} from "@/lib/spl/usdc";
import { MAX_DELEGATION_LAMPORTS } from "@/lib/spl/approve";
import { getLatestBlockhashWithFallback, getRpcUrls } from "./rpc";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export type LaunchPayload = {
  app: "phoenix-vault";
  v: 1;
  name: string;
  strategyTag: string;
  perfFeeBps: number;
  mgmtFeeBps: number;
  ts: number;
};

export type LaunchResult = {
  signature: string;
  payload: LaunchPayload;
  explorerUrl: string;
  rpcUrl: string;
  cluster: "devnet" | "testnet" | "mainnet";
  relayerAuthorized: boolean;
};

type SignAndSendFn = (tx: Transaction) => Promise<{ signature: string }>;

function buildMemoIx(payer: PublicKey, payload: LaunchPayload): TransactionInstruction {
  const data = Buffer.from(JSON.stringify(payload), "utf-8");
  return new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data,
  });
}

function detectCluster(rpcUrl: string): "devnet" | "testnet" | "mainnet" {
  if (rpcUrl.includes("devnet")) return "devnet";
  if (rpcUrl.includes("testnet")) return "testnet";
  return "mainnet";
}

export async function buildAndSendLaunchTx(params: {
  payer: PublicKey;
  payload: LaunchPayload;
  signAndSend: SignAndSendFn;
  /** When provided, the launch tx will idempotently create the manager's
   *  USDC ATA and approve this delegate for instant withdrawals in the same
   *  signature. Pass `null` (or omit) to skip and keep the tx minimal. */
  relayerDelegate?: PublicKey | null;
}): Promise<LaunchResult> {
  const { payer, payload, signAndSend, relayerDelegate } = params;

  const rpcUrls = getRpcUrls();
  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getLatestBlockhashWithFallback(rpcUrls, "confirmed");

  const cluster = detectCluster(rpcUrl);

  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(buildMemoIx(payer, payload));

  let relayerAuthorized = false;
  if (relayerDelegate) {
    const mint = usdcMintFor(clusterFromRpc(rpcUrl));
    const managerAta = deriveUsdcAta(payer, clusterFromRpc(rpcUrl));
    // Idempotent ATA create — safe even when the manager already has one.
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        managerAta,
        payer,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    tx.add(
      createApproveCheckedInstruction(
        managerAta,
        mint,
        relayerDelegate,
        payer,
        MAX_DELEGATION_LAMPORTS,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    relayerAuthorized = true;
  }

  const { signature } = await signAndSend(tx);

  // Best-effort confirmation against the same RPC; ignore failures so UI still shows the signature.
  try {
    const conn = new Connection(rpcUrl, "confirmed");
    await conn.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // ignore — signature is trackable on explorer regardless
  }

  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  const explorerUrl = `https://explorer.solana.com/tx/${signature}${clusterParam}`;

  return {
    signature,
    payload,
    explorerUrl,
    rpcUrl,
    cluster,
    relayerAuthorized,
  };
}
