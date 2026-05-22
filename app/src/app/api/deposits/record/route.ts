import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getPoolFromRegistry,
  recordDeposit,
} from "@/lib/registry/redis";
import { verifyDepositTx } from "@/lib/relayer/verify-deposit";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const bodySchema = z.object({
  poolAddress: z.string().regex(BASE58),
  depositor: z.string().regex(BASE58),
  signature: z.string().min(64).max(128),
  cluster: z.enum(["mainnet", "devnet", "testnet"]).default("mainnet"),
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

  // SIWS session is optional but recommended; if present, the depositor
  // must match the connected wallet so users can't backfill ledger entries
  // for other wallets.
  const session = await getSession();
  if (session && session.wallet !== parsed.data.depositor) {
    return NextResponse.json(
      { error: "Connected wallet does not match depositor" },
      { status: 403 }
    );
  }

  const pool = await getPoolFromRegistry(parsed.data.poolAddress);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  const verified = await verifyDepositTx({
    signature: parsed.data.signature,
    expectedDepositor: parsed.data.depositor,
    expectedManager: pool.manager,
    expectedPool: parsed.data.poolAddress,
    cluster: parsed.data.cluster,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  await recordDeposit({
    signature: verified.deposit.signature,
    poolAddress: verified.deposit.poolAddress,
    depositor: verified.deposit.depositor,
    amountUsdc: verified.deposit.amountUsdc,
    ts: verified.deposit.blockTime * 1000,
    cluster: verified.deposit.cluster as "mainnet" | "devnet" | "testnet",
  });

  return NextResponse.json({
    ok: true,
    deposit: verified.deposit,
  });
}
