import { NextRequest, NextResponse } from "next/server";
import { getNavHistory } from "@/lib/pools-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const range = (req.nextUrl.searchParams.get("range") ?? "7d") as
    | "1d"
    | "7d"
    | "30d"
    | "all";

  const history = await getNavHistory(params.address, range);
  return NextResponse.json({ history, range });
}
