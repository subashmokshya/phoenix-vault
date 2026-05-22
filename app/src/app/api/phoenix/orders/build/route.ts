import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildPhoenixOrder } from "@/lib/phoenix/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  authority: z.string().min(32),
  market: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit"]),
  sizeUsd: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  referencePrice: z.number().positive(),
  takeProfitPct: z.number().min(0).max(200).optional(),
  stopLossPct: z.number().min(0).max(80).optional(),
  leverage: z.number().min(1).max(20).optional(),
  reduceOnly: z.boolean().optional(),
  pdaIndex: z.number().int().min(0).max(255).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join("; ") ||
          "Invalid order payload",
      },
      { status: 400 }
    );
  }

  const result = await buildPhoenixOrder(parsed.data);
  if (!result.ok) {
    const status =
      result.source === "client"
        ? 400
        : result.status && result.status >= 400 && result.status < 600
          ? result.status
          : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
