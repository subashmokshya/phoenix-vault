"use client";

/**
 * Client-side USDC helpers. These functions touch a live RPC and rely on
 * `@solana/spl-token` runtime decoders that are safe in the browser bundle
 * but mis-bundled in some Vercel serverless builds — keeping them in a
 * "use client" module makes Next.js skip them entirely from server routes.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import {
  getLatestBlockhashWithFallback,
  getRpcUrls,
} from "@/lib/wallet/rpc";
import {
  USDC_DECIMALS,
  deriveUsdcAta,
  fromUsdcLamports,
  toUsdcLamports,
  usdcMintFor,
  type ClusterKind,
} from "./usdc";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export async function getUsdcBalance(
  connection: Connection,
  owner: PublicKey,
  cluster: ClusterKind = "mainnet"
): Promise<{
  uiAmount: number;
  lamports: bigint;
  ata: PublicKey;
  exists: boolean;
}> {
  const ata = deriveUsdcAta(owner, cluster);
  try {
    const acct = await getAccount(connection, ata);
    return {
      ata,
      lamports: acct.amount,
      uiAmount: fromUsdcLamports(acct.amount),
      exists: true,
    };
  } catch (e) {
    if (
      e instanceof TokenAccountNotFoundError ||
      e instanceof TokenInvalidAccountOwnerError
    ) {
      return { ata, lamports: BigInt(0), uiAmount: 0, exists: false };
    }
    throw e;
  }
}

type MemoPayload = Record<string, unknown>;

function buildMemoIx(
  payer: PublicKey,
  payload: MemoPayload
): TransactionInstruction {
  const data = Buffer.from(JSON.stringify(payload), "utf-8");
  return new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data,
  });
}

export type UsdcTransferResult = {
  signature: string;
  rpcUrl: string;
  fromAta: string;
  toAta: string;
  amountLamports: string;
  explorerUrl: string;
};

type SignAndSendFn = (tx: Transaction) => Promise<{ signature: string }>;

export async function sendUsdcTransfer(params: {
  from: PublicKey;
  to: PublicKey;
  amountUi: number;
  cluster: ClusterKind;
  memo?: MemoPayload;
  signAndSend: SignAndSendFn;
}): Promise<UsdcTransferResult> {
  const { from, to, amountUi, cluster, memo, signAndSend } = params;
  const mint = usdcMintFor(cluster);
  const amount = toUsdcLamports(amountUi);
  if (amount <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }

  const rpcUrls = getRpcUrls();
  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getLatestBlockhashWithFallback(rpcUrls, "confirmed");
  const connection = new Connection(rpcUrl, "confirmed");

  const fromAta = deriveUsdcAta(from, cluster);
  const toAta = deriveUsdcAta(to, cluster);

  let senderBalance: bigint = BigInt(0);
  try {
    const acct = await getAccount(connection, fromAta);
    senderBalance = acct.amount;
  } catch {
    throw new Error(
      `Your USDC token account does not exist yet. Send USDC to ${from
        .toBase58()
        .slice(0, 6)}… first to initialize it.`
    );
  }
  if (senderBalance < amount) {
    throw new Error(
      `Insufficient USDC. You have ${fromUsdcLamports(senderBalance).toFixed(
        2
      )} USDC; transfer requires ${amountUi.toFixed(2)}.`
    );
  }

  let recipientExists = true;
  try {
    await getAccount(connection, toAta);
  } catch {
    recipientExists = false;
  }

  const tx = new Transaction();
  tx.feePayer = from;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  if (!recipientExists) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        from,
        toAta,
        to,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from,
      amount,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  if (memo) {
    tx.add(buildMemoIx(from, memo));
  }

  const { signature } = await signAndSend(tx);

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // ignore; sig still trackable on explorer
  }

  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  const explorerUrl = `https://explorer.solana.com/tx/${signature}${clusterParam}`;

  return {
    signature,
    rpcUrl,
    fromAta: fromAta.toBase58(),
    toAta: toAta.toBase58(),
    amountLamports: amount.toString(),
    explorerUrl,
  };
}
