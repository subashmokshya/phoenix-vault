"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

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
  connection: Connection;
  payer: PublicKey;
  payload: LaunchPayload;
  signAndSend: SignAndSendFn;
}): Promise<LaunchResult> {
  const { connection, payer, payload, signAndSend } = params;

  const ix = buildMemoIx(payer, payload);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed"
  );
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(ix);

  const { signature } = await signAndSend(tx);

  // Best-effort confirmation; ignore confirmation errors so UI still shows the signature.
  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // ignore — signature is still trackable on explorer
  }

  const cluster = detectCluster(connection.rpcEndpoint);
  const clusterParam =
    cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  const explorerUrl = `https://explorer.solana.com/tx/${signature}${clusterParam}`;

  return { signature, payload, explorerUrl };
}
