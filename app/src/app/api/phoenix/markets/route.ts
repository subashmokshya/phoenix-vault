import { NextResponse } from "next/server";
import { fetchMarkets } from "@/lib/phoenix/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await fetchMarkets();
  return NextResponse.json(
    { markets, asOf: Date.now() },
    { headers: { "cache-control": "no-store" } }
  );
}
