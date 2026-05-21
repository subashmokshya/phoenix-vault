import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pools-service";
import {
  emptySnapshot,
  fetchLivePositions,
  type LiveSnapshot,
} from "@/lib/phoenix/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { searchParams } = new URL(req.url);
  const fallbackAuthority = searchParams.get("authority");

  const pool = await getPool(params.address);
  const authority = pool?.phoenixAuthority ?? pool?.manager ?? fallbackAuthority;

  if (!authority) {
    return NextResponse.json(
      { error: "Pool not found and no authority hint supplied" },
      { status: 404 }
    );
  }

  let snapshot: LiveSnapshot | null = null;
  try {
    snapshot = await fetchLivePositions(authority);
  } catch {
    snapshot = null;
  }

  return NextResponse.json(
    { snapshot: snapshot ?? emptySnapshot(authority) },
    { headers: { "cache-control": "no-store" } }
  );
}
