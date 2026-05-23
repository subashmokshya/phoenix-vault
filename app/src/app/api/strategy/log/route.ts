import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appendStrategyLog,
  getPoolFromRegistry,
  isRegistryConfigured,
  type StrategyLogEntry,
} from "@/lib/registry/redis";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tickActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("propose"),
    market: z.string(),
    side: z.enum(["buy", "sell"]),
    sizeUsd: z.number().positive(),
    orderType: z.enum(["market", "limit"]),
    rationale: z.string().max(800),
  }),
  z.object({ kind: z.literal("hold"), reason: z.string().max(400) }),
  z.object({ kind: z.literal("note"), text: z.string().max(800) }),
]);

const entrySchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("tick"),
    ts: z.number().int().positive(),
    source: z.enum(["auto", "manual"]),
    summary: z.string().max(1000),
    actions: z.array(tickActionSchema).max(8),
    proposedIds: z.array(z.string().max(80)).max(8),
    executedIds: z.array(z.string().max(80)).max(8),
    error: z.string().max(500).optional(),
  }),
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("order"),
    ts: z.number().int().positive(),
    source: z.enum(["manual", "ai", "runner"]),
    market: z.string().max(40),
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(["market", "limit"]),
    sizeUsd: z.number().positive(),
    status: z.enum(["submitting", "filled", "rejected", "blocked"]),
    signature: z.string().max(200).optional(),
    explorerUrl: z.string().url().optional(),
    quantity: z.number().optional(),
    collateralUsdc: z.number().optional(),
    referencePrice: z.number().optional(),
    estimatedLiquidationPriceUsd: z.number().nullable().optional(),
    tpTrigger: z.number().optional(),
    slTrigger: z.number().optional(),
    rationale: z.string().max(800).optional(),
    error: z.string().max(500).optional(),
  }),
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("spec"),
    ts: z.number().int().positive(),
    source: z.enum(["manager", "ai", "runner"]),
    summary: z.string().max(400),
    changes: z.array(z.string().max(200)).max(20),
  }),
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("system"),
    ts: z.number().int().positive(),
    summary: z.string().max(400),
    level: z.enum(["info", "warn", "error"]).optional(),
  }),
]);

const bodySchema = z.object({
  poolAddress: z.string().min(32).max(64),
  entry: entrySchema,
});

export async function POST(req: NextRequest) {
  if (!isRegistryConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Registry is not configured" },
      { status: 503 }
    );
  }

  const session = await getSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { ok: false, error: "Sign in with Solana to log strategy events" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid strategy log payload",
      },
      { status: 400 }
    );
  }

  const pool = await getPoolFromRegistry(parsed.data.poolAddress);
  if (!pool) {
    return NextResponse.json(
      { ok: false, error: "Pool not found" },
      { status: 404 }
    );
  }
  if (pool.manager !== session.wallet) {
    return NextResponse.json(
      { ok: false, error: "Only the pool manager can write strategy logs" },
      { status: 403 }
    );
  }

  const entry: StrategyLogEntry = parsed.data.entry;
  await appendStrategyLog(parsed.data.poolAddress, entry);

  return NextResponse.json({ ok: true, entry });
}
