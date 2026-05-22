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
): Promise<{
  amount: bigint;
  delegate: string | null;
  delegatedAmount: bigint;
  rpcUrl: string;
} | null> {
  const urls = SERVER_RPCS[cluster];
  for (const url of urls) {
    try {
      const conn = new Connection(url, "confirmed");
      const acct = await getAccount(conn, ata);
      return {
        amount: acct.amount,
        delegate: acct.delegate?.toBase58() ?? null,
        delegatedAmount: acct.delegatedAmount,
        rpcUrl: url,
      };
    } catch {
      // try next
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
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

  if (!acct) {
    return NextResponse.json({
      poolAddress: params.address,
      manager: pool.manager,
      ataExists: false,
      liquidityUsdc: 0,
      cluster: clusterParam,
    });
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
