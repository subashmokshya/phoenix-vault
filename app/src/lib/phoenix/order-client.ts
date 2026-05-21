"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getLatestBlockhashWithFallback,
  getRpcUrls,
} from "@/lib/wallet/rpc";

export type ProposedOrderInput = {
  authority: string;
  market: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  sizeUsd: number;
  limitPrice?: number;
  referencePrice: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  leverage?: number;
  reduceOnly?: boolean;
};

type SerializedAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type SerializedInstruction = {
  programId: string;
  keys: SerializedAccount[];
  data: string;
};

type BuildResponse =
  | {
      ok: true;
      source: "phoenix";
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      referencePrice: number;
      tpTrigger?: number;
      slTrigger?: number;
      instructions: SerializedInstruction[];
      feePayer: string;
    }
  | {
      ok: false;
      source: "phoenix" | "client";
      error: string;
      detail?: string;
    };

export type PhoenixOrderOutcome =
  | {
      ok: true;
      mode: "live";
      signature: string;
      explorerUrl: string;
      rpcUrl: string;
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      referencePrice: number;
      tpTrigger?: number;
      slTrigger?: number;
    }
  | {
      ok: false;
      kind: "blocked" | "rejected";
      error: string;
      detail?: string;
    };

type SignAndSendFn = (tx: Transaction) => Promise<{ signature: string }>;

function deserialize(ix: SerializedInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function clusterFromRpc(url: string): "mainnet" | "devnet" | "testnet" {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  return "mainnet";
}

export async function placePhoenixOrder(
  input: ProposedOrderInput,
  signAndSend: SignAndSendFn
): Promise<PhoenixOrderOutcome> {
  let build: BuildResponse;
  try {
    const res = await fetch("/api/phoenix/orders/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    build = (await res.json()) as BuildResponse;
  } catch (e) {
    return {
      ok: false,
      kind: "rejected",
      error: "Network error reaching Phoenix builder",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  if (!build.ok) {
    // The most common case: Phoenix beta is gated — surface a clear message but distinguish blocked vs invalid.
    const blocked =
      build.source === "phoenix" &&
      /forbidden|unauthorized|invite|access|beta|403|401/i.test(
        build.detail ?? build.error ?? ""
      );
    return {
      ok: false,
      kind: blocked ? "blocked" : "rejected",
      error: build.error,
      detail: build.detail,
    };
  }

  try {
    const rpcUrls = getRpcUrls();
    const { blockhash, lastValidBlockHeight, rpcUrl } =
      await getLatestBlockhashWithFallback(rpcUrls, "confirmed");
    const payer = new PublicKey(build.feePayer);
    const tx = new Transaction();
    tx.feePayer = payer;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    for (const ix of build.instructions) {
      tx.add(deserialize(ix));
    }

    const { signature } = await signAndSend(tx);

    try {
      const conn = new Connection(rpcUrl, "confirmed");
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
    } catch {
      // explorer link still works
    }

    const cluster = clusterFromRpc(rpcUrl);
    const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
    const explorerUrl = `https://explorer.solana.com/tx/${signature}${clusterParam}`;
    return {
      ok: true,
      mode: "live",
      signature,
      explorerUrl,
      rpcUrl,
      symbol: build.symbol,
      side: build.side,
      quantity: build.quantity,
      referencePrice: build.referencePrice,
      tpTrigger: build.tpTrigger,
      slTrigger: build.slTrigger,
    };
  } catch (e) {
    return {
      ok: false,
      kind: "rejected",
      error: "Order sign/send failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
