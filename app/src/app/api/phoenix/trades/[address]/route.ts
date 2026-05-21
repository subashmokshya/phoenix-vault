import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pools-service";
import { fetchLiveTrades, type LiveTrade } from "@/lib/phoenix/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { searchParams } = new URL(req.url);
  const fallbackAuthority = searchParams.get("authority");
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "25", 10), 5),
    100
  );

  const pool = await getPool(params.address);
  const authority = pool?.phoenixAuthority ?? pool?.manager ?? fallbackAuthority;

  if (!authority) {
    return NextResponse.json(
      { error: "Pool not found and no authority hint supplied" },
      { status: 404 }
    );
  }

  let trades: LiveTrade[] | null = null;
  try {
    trades = await fetchLiveTrades(authority, limit);
  } catch {
    trades = null;
  }

  return NextResponse.json(
    { trades: trades ?? [], source: "phoenix", authority },
    { headers: { "cache-control": "no-store" } }
  );
}
