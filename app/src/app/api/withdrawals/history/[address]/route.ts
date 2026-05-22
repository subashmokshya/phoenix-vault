import { NextRequest, NextResponse } from "next/server";
import { getPoolWithdrawals } from "@/lib/registry/redis";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  if (!BASE58.test(params.address)) {
    return NextResponse.json({ withdrawals: [] }, { status: 200 });
  }
  const withdrawals = await getPoolWithdrawals(params.address, 50);
  return NextResponse.json({ withdrawals });
}
