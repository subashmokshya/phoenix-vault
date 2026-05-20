import { NextRequest, NextResponse } from "next/server";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recomputeFeatured } from "@/lib/pools-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pools = await db.select().from(schema.pools);

  await db.delete(schema.leaderboardCache).where(sql`1=1`);

  for (const pool of pools) {
    const snapshots = await db
      .select()
      .from(schema.navSnapshots)
      .where(
        and(
          eq(schema.navSnapshots.poolAddress, pool.address),
          gte(schema.navSnapshots.ts, sevenDaysAgo)
        )
      )
      .orderBy(schema.navSnapshots.ts);

    if (snapshots.length < 2) continue;

    const first = snapshots[0].nav;
    const last = snapshots[snapshots.length - 1].nav;
    const pnl7d = first > 0 ? ((last - first) / first) * 100 : 0;
    const aum = snapshots[snapshots.length - 1].aum;

    const returns = snapshots.slice(1).map((s, i) => {
      const prev = snapshots[i].nav;
      return prev > 0 ? (s.nav - prev) / prev : 0;
    });
    const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const variance =
      returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length || 1);
    const sharpe7d = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(365) : 0;

    for (const [metric, value] of [
      ["pnl7d", pnl7d],
      ["aum", aum],
      ["sharpe7d", sharpe7d],
    ] as const) {
      await db.insert(schema.leaderboardCache).values({
        id: `${pool.address}-${metric}`,
        poolAddress: pool.address,
        manager: pool.manager,
        metric,
        rank: 0,
        value,
        pnl7d,
        pnl30d: 0,
        aum,
        sharpe7d,
      });
    }
  }

  const metrics = ["pnl7d", "aum", "sharpe7d"] as const;
  for (const metric of metrics) {
    const entries = await db
      .select()
      .from(schema.leaderboardCache)
      .where(eq(schema.leaderboardCache.metric, metric))
      .orderBy(desc(schema.leaderboardCache.value));

    for (let i = 0; i < entries.length; i++) {
      await db
        .update(schema.leaderboardCache)
        .set({ rank: i + 1 })
        .where(eq(schema.leaderboardCache.id, entries[i].id));
    }
  }

  await recomputeFeatured();

  return NextResponse.json({ ok: true });
}
