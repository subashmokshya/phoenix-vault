import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOENIX_API =
  process.env.NEXT_PUBLIC_PHOENIX_API_URL ?? "https://perp-api.phoenix.trade";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, mock: true, indexed: 0 });
  }

  const db = getDb();
  const poolRows = await db.select().from(schema.pools);
  let indexed = 0;

  for (const pool of poolRows) {
    const authority = pool.phoenixAuthority ?? pool.manager;
    try {
      const [stateRes, pnlRes] = await Promise.all([
        fetch(`${PHOENIX_API}/trader/${authority}/state`),
        fetch(`${PHOENIX_API}/trader/${authority}/pnl`),
      ]);

      if (!stateRes.ok || !pnlRes.ok) continue;

      const state = await stateRes.json();
      const pnl = await pnlRes.json();

      const nav = parseFloat(pnl?.nav ?? pnl?.totalPnl ?? "0") || 0;
      const unrealized = parseFloat(pnl?.unrealizedPnl ?? "0") || 0;
      const realized = parseFloat(pnl?.realizedPnl ?? "0") || 0;
      const aum = parseFloat(state?.collateral ?? state?.effectiveCollateral ?? "0") || nav;
      const totalShares = 1;
      const sharePrice = nav > 0 ? nav / totalShares : 1;

      const id = `${pool.address}-${Date.now()}`;
      await db.insert(schema.navSnapshots).values({
        id,
        poolAddress: pool.address,
        ts: new Date(),
        nav,
        totalShares,
        sharePrice,
        unrealizedPnl: unrealized,
        realizedPnl: realized,
        aum,
      });
      indexed++;
    } catch {
      // skip failed pools
    }
  }

  return NextResponse.json({ ok: true, indexed });
}
