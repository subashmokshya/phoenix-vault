import { NextResponse } from "next/server";
import { DEMO_POOLS } from "@/lib/mock-data";

export async function GET(
  _req: Request,
  { params }: { params: { wallet: string } }
) {
  const pools = DEMO_POOLS.filter((p) => p.manager === params.wallet);
  const totalAum = pools.reduce((s, p) => s + p.aum, 0);
  const weightedPnl =
    pools.length > 0
      ? pools.reduce((s, p) => s + p.pnl30d * p.aum, 0) / totalAum
      : 0;

  return NextResponse.json({
    manager: {
      wallet: params.wallet,
      displayName: pools[0]?.managerName ?? shortAddr(params.wallet),
      bio: "Professional perp trader on Phoenix.",
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
