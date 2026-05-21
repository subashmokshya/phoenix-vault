"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
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
}): Promise<LaunchResult> {
  const { payer, payload, signAndSend } = params;

  const rpcUrls = getRpcUrls();
  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getLatestBlockhashWithFallback(rpcUrls, "confirmed");

  const ix = buildMemoIx(payer, payload);
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(ix);

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

  const cluster = detectCluster(rpcUrl);
  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  const explorerUrl = `https://explorer.solana.com/tx/${signature}${clusterParam}`;

  return { signature, payload, explorerUrl, rpcUrl };
}
