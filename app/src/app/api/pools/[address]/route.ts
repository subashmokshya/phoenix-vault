import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pools-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const pool = await getPool(params.address);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }
  return NextResponse.json({ pool });
}
