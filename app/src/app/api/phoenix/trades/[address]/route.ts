import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pools-service";
import {
  demoTrades,
  fetchLiveTrades,
  type LiveTrade,
} from "@/lib/phoenix/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const pool = await getPool(params.address);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "25", 10), 5),
    100
  );

  const authority = pool.phoenixAuthority ?? pool.manager;

  let trades: LiveTrade[] | null = null;
  try {
    trades = await fetchLiveTrades(authority, limit);
  } catch {
    trades = null;
  }

  const isReal = trades && trades.length > 0;
  const source: "phoenix" | "demo" = isReal ? "phoenix" : "demo";
  const final = isReal ? trades! : demoTrades(pool, limit);

  return NextResponse.json(
    { trades: final, source, authority },
    { headers: { "cache-control": "no-store" } }
  );
}
