import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getPoolFromRegistry,
  setRelayerAuthorization,
} from "@/lib/registry/redis";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const bodySchema = z.object({
  poolAddress: z.string().regex(BASE58),
  authorized: z.boolean(),
  cluster: z.enum(["mainnet", "devnet", "testnet"]).default("mainnet"),
  signature: z.string().min(64).max(128).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const pool = await getPoolFromRegistry(parsed.data.poolAddress);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  const session = await getSession();
  if (session && session.wallet !== pool.manager) {
    return NextResponse.json(
      { error: "Only the pool manager can change relayer authorization" },
      { status: 403 }
    );
  }

  const updated = await setRelayerAuthorization(parsed.data.poolAddress, {
    authorized: parsed.data.authorized,
    cluster: parsed.data.cluster,
    signature: parsed.data.signature,
  });
  return NextResponse.json({ ok: true, pool: updated });
}
