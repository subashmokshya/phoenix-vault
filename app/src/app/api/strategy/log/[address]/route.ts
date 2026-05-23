import { NextRequest, NextResponse } from "next/server";
import {
  isRegistryConfigured,
  listStrategyLogs,
} from "@/lib/registry/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  if (!isRegistryConfigured()) {
    return NextResponse.json(
      { entries: [], configured: false },
      { headers: { "cache-control": "no-store" } }
    );
  }
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const safeLimit =
    Number.isFinite(limit) && limit > 0 && limit <= 200 ? Math.floor(limit) : 50;

  const entries = await listStrategyLogs(params.address, safeLimit);
  return NextResponse.json(
    { entries, configured: true },
    { headers: { "cache-control": "no-store" } }
  );
}
