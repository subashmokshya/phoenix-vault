import "server-only";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";

/**
 * Minimal SPL Token Account parser — avoids bundling oddities with
 * `getAccount` in serverless functions. See the liquidity route for
 * the same workaround.
 */
function parseTokenAccount(data: Buffer): {
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
} {
  const amount = data.readBigUInt64LE(64);
  const delegateTag = data.readUInt32LE(72);
  const delegate =
    delegateTag === 1 ? new PublicKey(data.subarray(76, 108)) : null;
  const delegatedAmount = data.readBigUInt64LE(121);
  return { amount, delegate, delegatedAmount };
}
import {
  USDC_DECIMALS,
  deriveUsdcAta,
  toUsdcLamports,
  usdcMintFor,
  type ClusterKind,
} from "@/lib/spl/usdc";
import { getRelayerKeypair } from "./keypair";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

const SERVER_RPCS: Record<ClusterKind, string[]> = {
  mainnet: [
    process.env.SOLANA_RPC ?? "",
    process.env.NEXT_PUBLIC_SOLANA_RPC ?? "",
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
  ].filter(Boolean),
  devnet: [
    process.env.SOLANA_DEVNET_RPC ?? "",
    "https://api.devnet.solana.com",
  ].filter(Boolean),
  testnet: ["https://api.testnet.solana.com"],
  unknown: [],
};

function rpcsFor(cluster: ClusterKind): string[] {
  const list = SERVER_RPCS[cluster];
  if (list && list.length > 0) return list;
  return SERVER_RPCS.mainnet;
}

async function getBlockhashWithFallback(
  cluster: ClusterKind
): Promise<{ blockhash: string; lastValidBlockHeight: number; rpcUrl: string }> {
  let lastError: unknown = null;
  for (const url of rpcsFor(cluster)) {
    try {
      const conn = new Connection(url, "confirmed");
      const r = await conn.getLatestBlockhash("confirmed");
      return {
        blockhash: r.blockhash,
        lastValidBlockHeight: r.lastValidBlockHeight,
        rpcUrl: url,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `All RPCs failed for ${cluster}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

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

export type RelayerTransferParams = {
  manager: PublicKey;
  depositor: PublicKey;
  amountUsdc: number;
  cluster: ClusterKind;
  poolAddress: string;
};

export type RelayerTransferResult = {
  signature: string;
  explorerUrl: string;
  rpcUrl: string;
  fromAta: string;
  toAta: string;
  amountLamports: string;
  cluster: ClusterKind;
};

/**
 * Refunds USDC from a manager's ATA to a depositor's ATA, signed by the
 * platform relayer keypair via SPL token delegation. The manager must have
 * called `approve` granting the relayer authority before calling this.
 */
export async function relayUsdcRefund(
  params: RelayerTransferParams
): Promise<RelayerTransferResult> {
  const { manager, depositor, amountUsdc, cluster, poolAddress } = params;
  const relayer = getRelayerKeypair();
  const mint = usdcMintFor(cluster);
  const amount = toUsdcLamports(amountUsdc);
  if (amount <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }

  const managerAta = deriveUsdcAta(manager, cluster);
  const depositorAta = deriveUsdcAta(depositor, cluster);

  const { blockhash, lastValidBlockHeight, rpcUrl } =
    await getBlockhashWithFallback(cluster);
  const connection = new Connection(rpcUrl, "confirmed");

  const relayerBalance = await connection.getBalance(
    relayer.publicKey,
    "confirmed"
  );
  // Covers several signatures plus ATA rent if the recipient's USDC ATA needs
  // to be created by the relayer. Keep this high enough to avoid opaque
  // "Attempt to debit an account..." simulation failures.
  const minRelayerLamports = Math.ceil(0.005 * LAMPORTS_PER_SOL);
  if (relayerBalance < minRelayerLamports) {
    throw new Error(
      `Withdrawal relayer needs SOL for network fees. Send at least 0.01 SOL to ${relayer.publicKey.toBase58()} and retry. Current balance: ${(relayerBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL.`
    );
  }

  // Sanity: confirm the manager ATA exists and has at least `amount`, and the
  // delegate of that ATA is our relayer pubkey with at least `amount` allowance.
  const managerInfo = await connection.getAccountInfo(managerAta, "confirmed");
  if (!managerInfo) {
    throw new Error(
      "Manager USDC token account does not exist on this cluster."
    );
  }
  const managerAcct = parseTokenAccount(Buffer.from(managerInfo.data));
  if (managerAcct.amount < amount) {
    throw new Error(
      `Pool liquid balance is only ${
        Number(managerAcct.amount) / 1_000_000
      } USDC; ${amountUsdc} USDC is currently locked in open trades. Try a smaller amount or wait for positions to settle.`
    );
  }
  if (
    !managerAcct.delegate ||
    !managerAcct.delegate.equals(relayer.publicKey)
  ) {
    throw new Error(
      "Manager has not authorized the platform relayer for instant withdrawals on this token account."
    );
  }
  if (managerAcct.delegatedAmount < amount) {
    throw new Error(
      `Manager's delegation allowance (${
        Number(managerAcct.delegatedAmount) / 1_000_000
      } USDC) is insufficient for this refund. Ask the manager to re-authorize.`
    );
  }

  // Ensure depositor ATA exists; if not, create it (relayer pays rent).
  const depositorInfo = await connection.getAccountInfo(
    depositorAta,
    "confirmed"
  );
  const depositorAtaExists = !!depositorInfo;

  const tx = new Transaction();
  tx.feePayer = relayer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  if (!depositorAtaExists) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        relayer.publicKey,
        depositorAta,
        depositor,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // TransferChecked signed by the delegate (relayer) instead of the owner.
  tx.add(
    createTransferCheckedInstruction(
      managerAta,
      mint,
      depositorAta,
      relayer.publicKey,
      amount,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  tx.add(
    buildMemoIx(relayer.publicKey, {
      app: "phoenix-vault",
      v: 1,
      action: "withdraw-instant",
      pool: poolAddress,
      depositor: depositor.toBase58(),
      amountUsdc,
    })
  );

  tx.sign(relayer);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch {
    // sig still trackable
  }

  const clusterParam = cluster === "mainnet" ? "" : `?cluster=${cluster}`;
  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}${clusterParam}`,
    rpcUrl,
    fromAta: managerAta.toBase58(),
    toAta: depositorAta.toBase58(),
    amountLamports: amount.toString(),
    cluster,
  };
}
