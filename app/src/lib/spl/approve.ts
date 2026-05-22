"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createRevokeInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  getLatestBlockhashWithFallback,
  getRpcUrls,
} from "@/lib/wallet/rpc";
import {
  clusterFromRpc,
  deriveUsdcAta,
  USDC_DECIMALS,
  usdcMintFor,
  type ClusterKind,
} from "./usdc";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

/**
 * 2 ^ 53 - 1 lamport ≈ 9 trillion USDC. Effectively unlimited delegation;
 * managers can revoke at any time. We can't pass `u64::MAX` directly because
 * Number can't represent it; this is well above any plausible AUM and well
 * below the SPL Token max delegation cap (`u64::MAX`).
 */
export const MAX_DELEGATION_LAMPORTS = BigInt(Number.MAX_SAFE_INTEGER);

type SignAndSendFn = (tx: Transaction) => Promise<{ signature: string }>;

function buildMemoIx(
  payer: PublicKey,
  payload: Record<string, unknown>
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(JSON.stringify(payload), "utf-8"),
  });
}

export type ApproveResult = {
  signature: string;
  explorerUrl: string;
  cluster: ClusterKind;
  ataExists: boolean;
};

/**
 * Approves a delegate (the platform withdrawal relayer) to spend up to
 * MAX_DELEGATION_LAMPORTS USDC on behalf of `manager`. Required once per pool
 * before instant withdrawals can be processed.
 */
export async function sendApproveRelayer(params: {
  manager: PublicKey;
  relayer: PublicKey;
  poolAddress: string;
  signAndSend: SignAndSendFn;
}): Promise<ApproveResult> {
  const { manager, relayer, poolAddress, signAndSend } = params;
  const rpcUrls = getRpcUrls();
  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getLatestBlockhashWithFallback(rpcUrls, "confirmed");
  const cluster = clusterFromRpc(rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = usdcMintFor(cluster);
  const managerAta = deriveUsdcAta(manager, cluster);

  let ataExists = true;
  try {
    await getAccount(connection, managerAta);
  } catch {
    ataExists = false;
  }
  if (!ataExists) {
    throw new Error(
      "Your USDC token account does not exist on this cluster yet. Receive any USDC amount to initialize it, then retry."
    );
  }

  const tx = new Transaction();
  tx.feePayer = manager;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  tx.add(
    createApproveCheckedInstruction(
      managerAta,
      mint,
      relayer,
      manager,
      MAX_DELEGATION_LAMPORTS,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  tx.add(
    buildMemoIx(manager, {
      app: "phoenix-vault",
      v: 1,
      action: "authorize-relayer",
      pool: poolAddress,
      relayer: relayer.toBase58(),
    })
  );

  const { signature } = await signAndSend(tx);

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // ignore — sig is still trackable
  }

  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}${clusterParam}`,
    cluster,
    ataExists,
  };
}

export async function sendRevokeRelayer(params: {
  manager: PublicKey;
  poolAddress: string;
  signAndSend: SignAndSendFn;
}): Promise<ApproveResult> {
  const { manager, poolAddress, signAndSend } = params;
  const rpcUrls = getRpcUrls();
  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getLatestBlockhashWithFallback(rpcUrls, "confirmed");
  const cluster = clusterFromRpc(rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");
  const managerAta = deriveUsdcAta(manager, cluster);

  const tx = new Transaction();
  tx.feePayer = manager;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  tx.add(createRevokeInstruction(managerAta, manager, [], TOKEN_PROGRAM_ID));
  tx.add(
    buildMemoIx(manager, {
      app: "phoenix-vault",
      v: 1,
      action: "revoke-relayer",
      pool: poolAddress,
    })
  );

  const { signature } = await signAndSend(tx);
  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // ignore
  }
  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}${clusterParam}`,
    cluster,
    ataExists: true,
  };
}
