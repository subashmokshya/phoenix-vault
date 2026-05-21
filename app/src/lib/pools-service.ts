import { desc, eq, and, gte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { PoolCard } from "./mock-data";

const HAS_DB = Boolean(process.env.DATABASE_URL);

export async function listPools(opts?: {
  sort?: "pnl7d" | "pnl30d" | "aum" | "newest";
  strategy?: string;
  featured?: boolean;
  manager?: string;
  limit?: number;
}): Promise<PoolCard[]> {
  if (!HAS_DB) return [];

  const db = getDb();
  const filters = [] as ReturnType<typeof eq>[];
  if (opts?.featured) filters.push(eq(schema.pools.featured, true));
  if (opts?.strategy) filters.push(eq(schema.pools.strategyTag, opts.strategy));
  if (opts?.manager) filters.push(eq(schema.pools.manager, opts.manager));

  const baseQuery = db.select().from(schema.pools);
  const filtered = filters.length
    ? baseQuery.where(and(...filters))
    : baseQuery;
  const ordered =
    opts?.sort === "newest"
      ? filtered.orderBy(desc(schema.pools.createdAt))
      : filtered.orderBy(desc(schema.pools.createdAt));
  const rows = await ordered.limit(opts?.limit ?? 50);
  return rows.map(mapDbPoolToCard);
}

export async function getPool(address: string): Promise<PoolCard | null> {
  if (!HAS_DB) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.pools)
    .where(eq(schema.pools.address, address))
    .limit(1);
  return row ? mapDbPoolToCard(row) : null;
}

export async function getPoolsByManager(manager: string): Promise<PoolCard[]> {
  return listPools({ manager, limit: 100 });
}

export async function getNavHistory(
  address: string,
  range: "1d" | "7d" | "30d" | "all"
): Promise<{ ts: string; nav: number }[]> {
  if (!HAS_DB) return [];

  const db = getDb();
  const since = new Date();
  if (range === "1d") since.setDate(since.getDate() - 1);
  else if (range === "7d") since.setDate(since.getDate() - 7);
  else if (range === "30d") since.setDate(since.getDate() - 30);
  else since.setFullYear(since.getFullYear() - 2);

  const rows = await db
    .select()
    .from(schema.navSnapshots)
    .where(
      and(
        eq(schema.navSnapshots.poolAddress, address),
        gte(schema.navSnapshots.ts, since)
      )
    )
    .orderBy(schema.navSnapshots.ts);

  return rows.map((r) => ({
    ts: r.ts.toISOString(),
    nav: r.nav,
  }));
}

export async function getLeaderboard(
  metric: "pnl7d" | "pnl30d" | "aum" | "sharpe7d",
  limit = 20
) {
  if (!HAS_DB) return [];

  const db = getDb();
  return db
    .select()
    .from(schema.leaderboardCache)
    .where(eq(schema.leaderboardCache.metric, metric))
    .orderBy(schema.leaderboardCache.rank)
    .limit(limit);
}

export async function recomputeFeatured() {
  if (!HAS_DB) return [];
  const db = getDb();
  const MIN_AUM = 100_000;

  const top = await db
    .select({
      poolAddress: schema.leaderboardCache.poolAddress,
      sharpe7d: schema.leaderboardCache.sharpe7d,
      aum: schema.leaderboardCache.aum,
    })
    .from(schema.leaderboardCache)
    .where(
      and(
        eq(schema.leaderboardCache.metric, "sharpe7d"),
        gte(schema.leaderboardCache.aum, MIN_AUM)
      )
    )
    .orderBy(desc(schema.leaderboardCache.sharpe7d))
    .limit(6);

  await db
    .update(schema.pools)
    .set({ featured: false })
    .where(sql`1=1`);

  for (const entry of top) {
    await db
      .update(schema.pools)
      .set({ featured: true })
      .where(eq(schema.pools.address, entry.poolAddress));
  }

  return top;
}

function mapDbPoolToCard(row: typeof schema.pools.$inferSelect): PoolCard {
  return {
    address: row.address,
    name: row.name,
    manager: row.manager,
    managerName: shortManager(row.manager),
    strategyTag: row.strategyTag,
    description: row.description ?? "",
    aum: 0,
    pnl7d: 0,
    pnl30d: 0,
    perfFeeBps: row.perfFeeBps,
    mgmtFeeBps: row.mgmtFeeBps,
    featured: row.featured,
    depositorCount: 0,
    sharePrice: 1,
    navHistory: [],
    phoenixAuthority: row.phoenixAuthority ?? undefined,
  };
}

function shortManager(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}
