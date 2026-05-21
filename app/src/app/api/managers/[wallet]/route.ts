import { NextResponse } from "next/server";
import { getPoolsByManager } from "@/lib/pools-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { wallet: string } }
) {
  const pools = await getPoolsByManager(params.wallet);
  const totalAum = pools.reduce((s, p) => s + p.aum, 0);
  const weightedPnl =
    totalAum > 0
      ? pools.reduce((s, p) => s + p.pnl30d * p.aum, 0) / totalAum
      : 0;

  return NextResponse.json({
    manager: {
      wallet: params.wallet,
      displayName: shortAddr(params.wallet),
      bio: "",
      totalAum,
      weightedPnl,
      poolCount: pools.length,
      pools,
    },
  });
}

function shortAddr(w: string) {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}
