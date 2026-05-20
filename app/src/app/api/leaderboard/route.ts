import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/pools-service";

export async function GET(req: NextRequest) {
  const metric = (req.nextUrl.searchParams.get("metric") ?? "pnl7d") as
    | "pnl7d"
    | "pnl30d"
    | "aum"
    | "sharpe7d";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  const entries = await getLeaderboard(metric, limit);
  return NextResponse.json({ entries, metric });
}
