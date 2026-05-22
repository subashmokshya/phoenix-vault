import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { getPoolFromRegistry } from "@/lib/registry/redis";
import {
  deriveUsdcAta,
  type ClusterKind,
} from "@/lib/spl/usdc";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

async function tryGetUsdcAccount(
  cluster: ClusterKind,
  ata: PublicKey
): Promise<
  | {
      kind: "found";
      amount: bigint;
      delegate: string | null;
      delegatedAmount: bigint;
      rpcUrl: string;
    }
  | { kind: "missing"; rpcUrl: string }
  | { kind: "error"; error: string }
> {
  const urls = SERVER_RPCS[cluster];
  if (urls.length === 0) {
    return { kind: "error", error: `No RPC configured for cluster ${cluster}` };
  }
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const conn = new Connection(url, "confirmed");
      const acct = await getAccount(conn, ata);
      return {
        kind: "found",
        amount: acct.amount,
        delegate: acct.delegate?.toBase58() ?? null,
        delegatedAmount: acct.delegatedAmount,
        rpcUrl: url,
      };
    } catch (e) {
      // TokenAccountNotFoundError: the ATA simply does not exist yet —
      // that's a valid "0 liquidity" state, not an error.
      const message = e instanceof Error ? e.message : String(e);
      if (message.toLowerCase().includes("could not find account")) {
        return { kind: "missing", rpcUrl: url };
      }
      lastError = e;
    }
  }
  return {
    kind: "error",
    error: lastError instanceof Error ? lastError.message : "RPC unreachable",
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    return await handle(req, params);
  } catch (e) {
    return NextResponse.json(
      {
        poolAddress: params.address,
        liquidityUsdc: 0,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

async function handle(
  req: NextRequest,
  params: { address: string }
): Promise<NextResponse> {
  if (!BASE58.test(params.address)) {
    return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
  }
  const url = new URL(req.url);
  const clusterParam = (url.searchParams.get("cluster") ?? "mainnet") as ClusterKind;

  const pool = await getPoolFromRegistry(params.address);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  let manager: PublicKey;
  try {
    manager = new PublicKey(pool.manager);
  } catch {
    return NextResponse.json(
      { error: "Invalid manager pubkey on record" },
      { status: 500 }
    );
  }

  const ata = deriveUsdcAta(manager, clusterParam);
  const acct = await tryGetUsdcAccount(clusterParam, ata);

  if (acct.kind === "missing") {
    return NextResponse.json({
      poolAddress: params.address,
      manager: pool.manager,
      ataExists: false,
      liquidityUsdc: 0,
      cluster: clusterParam,
    });
  }
  if (acct.kind === "error") {
    return NextResponse.json(
      {
        poolAddress: params.address,
        manager: pool.manager,
        liquidityUsdc: 0,
        cluster: clusterParam,
        error: acct.error,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    poolAddress: params.address,
    manager: pool.manager,
    ataExists: true,
    liquidityUsdc: Number(acct.amount) / 1_000_000,
    delegate: acct.delegate,
    delegatedAmountUsdc: Number(acct.delegatedAmount) / 1_000_000,
    cluster: clusterParam,
  });
}
