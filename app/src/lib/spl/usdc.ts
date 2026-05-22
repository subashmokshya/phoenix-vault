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
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import {
  getLatestBlockhashWithFallback,
  getRpcUrls,
} from "@/lib/wallet/rpc";

export const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// Devnet USDC (Circle test mint commonly used by Phoenix devnet).
export const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const USDC_DECIMALS = 6;

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export type ClusterKind = "mainnet" | "devnet" | "testnet" | "unknown";

export function clusterFromRpc(url: string): ClusterKind {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  if (url.includes("mainnet") || url.includes("mainnet-beta") || url.includes("helius-rpc.com"))
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

function buildMemoIx(payer: PublicKey, payload: MemoPayload): TransactionInstruction {
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

  // Confirm sender ATA has enough.
  let senderBalance: bigint = BigInt(0);
  try {
    const acct = await getAccount(connection, fromAta);
    senderBalance = acct.amount;
  } catch {
    throw new Error(
      `Your USDC token account does not exist yet. Send USDC to ${from.toBase58().slice(0, 6)}… first to initialize it.`
    );
  }
  if (senderBalance < amount) {
    throw new Error(
      `Insufficient USDC. You have ${fromUsdcLamports(senderBalance).toFixed(2)} USDC; transfer requires ${amountUi.toFixed(2)}.`
    );
  }

  // Create recipient ATA on-the-fly if missing (payer = sender).
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
