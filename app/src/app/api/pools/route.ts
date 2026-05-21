import { NextRequest, NextResponse } from "next/server";
import { listPools } from "@/lib/pools-service";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") as
    | "pnl7d"
    | "pnl30d"
    | "aum"
    | "newest"
    | null;
  const strategy = searchParams.get("strategy") ?? undefined;
  const featured = searchParams.get("featured") === "true";
  const manager = searchParams.get("manager") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  const pools = await listPools({
    sort: sort ?? undefined,
    strategy,
    featured,
    manager,
    limit,
  });
  return NextResponse.json({ pools });
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const createPoolSchema = z.object({
  address: z.string().regex(BASE58, "address must be a Solana base58 pubkey"),
  manager: z.string().regex(BASE58, "manager must be a Solana base58 pubkey"),
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  strategyTag: z.string().min(1),
  perfFeeBps: z.number().min(0).max(5000),
  mgmtFeeBps: z.number().min(0).max(1000),
  phoenixAuthority: z.string().regex(BASE58).optional(),
  vaultIndex: z.number().int().min(0).max(255).optional(),
});

function formatZodError(error: z.ZodError): string {
  const flattened = error.flatten();
  const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
  const messages = [
    ...flattened.formErrors,
    ...Object.entries(fieldErrors).flatMap(([field, errors]) =>
      (errors ?? []).map((message) => `${field}: ${message}`)
    ),
  ];
  return messages.join("; ") || "Invalid pool payload";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createPoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }

  const session = await getSession();
  if (session && session.wallet !== parsed.data.manager) {
    return NextResponse.json(
      { error: "Connected wallet does not match pool manager" },
      { status: 403 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Pool registry database is not configured. The on-chain launch succeeded but cannot be saved to the registry.",
      },
      { status: 503 }
    );
  }

  const db = getDb();
  await db
    .insert(schema.pools)
    .values({
      address: parsed.data.address,
      manager: parsed.data.manager,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      strategyTag: parsed.data.strategyTag,
      perfFeeBps: parsed.data.perfFeeBps,
      mgmtFeeBps: parsed.data.mgmtFeeBps,
      phoenixAuthority: parsed.data.phoenixAuthority,
      vaultIndex: parsed.data.vaultIndex ?? 0,
    })
    .onConflictDoUpdate({
      target: schema.pools.address,
      set: {
        name: parsed.data.name,
        description: parsed.data.description ?? "",
        strategyTag: parsed.data.strategyTag,
        perfFeeBps: parsed.data.perfFeeBps,
        mgmtFeeBps: parsed.data.mgmtFeeBps,
        phoenixAuthority: parsed.data.phoenixAuthority,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true, pool: parsed.data });
}
