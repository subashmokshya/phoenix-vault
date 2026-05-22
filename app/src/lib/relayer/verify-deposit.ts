import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  USDC_MINT_DEVNET,
  USDC_MINT_MAINNET,
  deriveUsdcAta,
  type ClusterKind,
} from "@/lib/spl/usdc";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

export type VerifiedDeposit = {
  poolAddress: string;
  depositor: string;
  manager: string;
  amountUsdc: number;
  cluster: ClusterKind;
  blockTime: number;
  signature: string;
};

type ParsedInstructionLike = {
  programId?: string | PublicKey;
  program?: string;
  parsed?:
    | {
        type?: string;
        info?: Record<string, unknown>;
      }
    | string;
};

async function fetchParsedTx(
  signature: string,
  cluster: ClusterKind
): Promise<{
  tx: Awaited<ReturnType<Connection["getParsedTransaction"]>>;
  rpcUrl: string;
} | null> {
  const urls =
    SERVER_RPCS[cluster].length > 0 ? SERVER_RPCS[cluster] : SERVER_RPCS.mainnet;
  for (const url of urls) {
    try {
      const conn = new Connection(url, "confirmed");
      const tx = await conn.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx) return { tx, rpcUrl: url };
    } catch {
      // try next
    }
  }
  return null;
}

function decodeMemoData(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // some clients double-encode
    try {
      return JSON.parse(JSON.parse(raw)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function lamportsToUi(amount: bigint | number | string): number {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export async function verifyDepositTx(params: {
  signature: string;
  expectedDepositor: string;
  expectedManager: string;
  expectedPool: string;
  cluster: ClusterKind;
}): Promise<{ ok: true; deposit: VerifiedDeposit } | { ok: false; error: string }> {
  const { signature, expectedDepositor, expectedManager, expectedPool, cluster } =
    params;

  let depositor: PublicKey;
  let manager: PublicKey;
  try {
    depositor = new PublicKey(expectedDepositor);
    manager = new PublicKey(expectedManager);
  } catch {
    return { ok: false, error: "Invalid depositor or manager pubkey" };
  }

  const result = await fetchParsedTx(signature, cluster);
  if (!result || !result.tx) {
    return {
      ok: false,
      error: "Transaction not found on RPC. Please retry once it confirms.",
    };
  }
  if (result.tx.meta?.err) {
    return {
      ok: false,
      error: "Deposit transaction failed on-chain.",
    };
  }

  const instructions = (result.tx.transaction.message.instructions ??
    []) as ParsedInstructionLike[];

  const expectedMint =
    cluster === "devnet" ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
  const expectedFromAta = deriveUsdcAta(depositor, cluster).toBase58();
  const expectedToAta = deriveUsdcAta(manager, cluster).toBase58();

  let transferAmountLamports: bigint | null = null;
  let memoPayload: Record<string, unknown> | null = null;

  for (const ix of instructions) {
    const programIdStr =
      typeof ix.programId === "string"
        ? ix.programId
        : (ix.programId as PublicKey | undefined)?.toBase58?.() ?? "";

    if (programIdStr === MEMO_PROGRAM_ID) {
      // Memo program — `parsed` is the raw string for v1 memos.
      if (typeof ix.parsed === "string") {
        const decoded = decodeMemoData(ix.parsed);
        if (decoded) memoPayload = decoded;
      }
    } else if (programIdStr === SPL_TOKEN_PROGRAM_ID) {
      if (typeof ix.parsed === "object" && ix.parsed !== null) {
        const parsed = ix.parsed;
        const type = parsed.type ?? "";
        if (type === "transferChecked" || type === "transfer") {
          const info = (parsed.info ?? {}) as Record<string, unknown>;
          const source = String(info.source ?? "");
          const destination = String(info.destination ?? "");
          const mint = String(info.mint ?? "");
          if (
            source === expectedFromAta &&
            destination === expectedToAta &&
            (type === "transfer" || mint === expectedMint.toBase58())
          ) {
            const tokenAmount = (info.tokenAmount ?? {}) as Record<
              string,
              unknown
            >;
            const amountStr =
              typeof tokenAmount.amount === "string"
                ? tokenAmount.amount
                : typeof info.amount === "string"
                  ? (info.amount as string)
                  : "";
            if (amountStr) {
              try {
                transferAmountLamports = BigInt(amountStr);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    }
  }

  if (transferAmountLamports === null) {
    return {
      ok: false,
      error:
        "No matching USDC transfer from depositor to manager found in this transaction.",
    };
  }

  // Memo is optional but we cross-check the pool address when present.
  if (memoPayload) {
    const memoPool = String(memoPayload.pool ?? "");
    if (memoPool && memoPool !== expectedPool) {
      return {
        ok: false,
        error: `Deposit memo pool ${memoPool} does not match expected pool ${expectedPool}.`,
      };
    }
  }

  const amountUsdc = lamportsToUi(transferAmountLamports);

  return {
    ok: true,
    deposit: {
      poolAddress: expectedPool,
      depositor: depositor.toBase58(),
      manager: manager.toBase58(),
      amountUsdc,
      cluster,
      blockTime: result.tx.blockTime ?? Math.floor(Date.now() / 1000),
      signature,
    },
  };
}
