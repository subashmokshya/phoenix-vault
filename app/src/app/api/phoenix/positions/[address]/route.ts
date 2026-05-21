import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pools-service";
import {
  demoSnapshot,
  fetchLivePositions,
  type LiveSnapshot,
} from "@/lib/phoenix/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const pool = await getPool(params.address);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  const authority = pool.phoenixAuthority ?? pool.manager;

  let snapshot: LiveSnapshot | null = null;
  try {
    snapshot = await fetchLivePositions(authority);
  } catch {
    snapshot = null;
  }

  const hasRealActivity =
    snapshot && (snapshot.positions.length > 0 || snapshot.collateral > 0);

  const final = hasRealActivity ? snapshot! : demoSnapshot(pool);

  return NextResponse.json(
    { snapshot: final },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
