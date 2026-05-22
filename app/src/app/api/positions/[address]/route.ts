import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getNetPosition } from "@/lib/registry/redis";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  if (!BASE58.test(params.address)) {
    return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
  }
  const url = new URL(req.url);
  const explicitDepositor = url.searchParams.get("depositor");
  const session = await getSession();
  const depositor = explicitDepositor ?? session?.wallet ?? null;
  if (!depositor) {
    return NextResponse.json(
      { error: "No depositor wallet provided", net: 0 },
      { status: 200 }
    );
  }
  if (!BASE58.test(depositor)) {
    return NextResponse.json(
      { error: "Invalid depositor address", net: 0 },
      { status: 400 }
    );
  }
  const position = await getNetPosition(depositor, params.address);
  return NextResponse.json({
    poolAddress: params.address,
    depositor,
    ...position,
  });
}
