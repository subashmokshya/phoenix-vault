import { desc, eq, and, gte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import {
  DEMO_POOLS,
  getFeaturedPools,
  type PoolCard,
} from "./mock-data";

const USE_MOCK = !process.env.DATABASE_URL;

export async function listPools(opts?: {
  sort?: "pnl7d" | "pnl30d" | "aum" | "newest";
  strategy?: string;
  featured?: boolean;
  limit?: number;
}): Promise<PoolCard[]> {
  if (USE_MOCK) {
    let pools = [...DEMO_POOLS];
    if (opts?.featured) pools = pools.filter((p) => p.featured);
    if (opts?.strategy)
      pools = pools.filter(
        (p) => p.strategyTag.toLowerCase() === opts.strategy!.toLowerCase()
      );
    switch (opts?.sort) {
      case "pnl7d":
        pools.sort((a, b) => b.pnl7d - a.pnl7d);
        break;
      case "pnl30d":
        pools.sort((a, b) => b.pnl30d - a.pnl30d);
        break;
      case "aum":
        pools.sort((a, b) => b.aum - a.aum);
        break;
      default:
        break;
    }
    return pools.slice(0, opts?.limit ?? 50);
  }

  const db = getDb();
  const rows = await db.select().from(schema.pools).limit(opts?.limit ?? 50);
  return rows.map(mapDbPoolToCard);
}

export async function getPool(address: string): Promise<PoolCard | null> {
  if (USE_MOCK) {
    return DEMO_POOLS.find((p) => p.address === address) ?? syntheticLaunchPool(address);
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.pools)
    .where(eq(schema.pools.address, address))
    .limit(1);
  return row ? mapDbPoolToCard(row) : syntheticLaunchPool(address);
}

export async function getNavHistory(
  address: string,
  range: "1d" | "7d" | "30d" | "all"
): Promise<{ ts: string; nav: number }[]> {
  if (USE_MOCK) {
    const pool = DEMO_POOLS.find((p) => p.address === address);
    if (!pool) return [];
    const days = range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
    return pool.navHistory.slice(-days);
  }

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
  if (USE_MOCK) {
    const pools = [...DEMO_POOLS];
    const key =
      metric === "pnl7d"
        ? "pnl7d"
        : metric === "pnl30d"
          ? "pnl30d"
          : metric === "aum"
            ? "aum"
            : "pnl7d";
    return pools
      .sort((a, b) => (b[key as keyof PoolCard] as number) - (a[key as keyof PoolCard] as number))
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        poolAddress: p.address,
        poolName: p.name,
        manager: p.manager,
        managerName: p.managerName,
        value: p[key as keyof PoolCard] as number,
        pnl7d: p.pnl7d,
        pnl30d: p.pnl30d,
        aum: p.aum,
      }));
  }

  const db = getDb();
  return db
    .select()
    .from(schema.leaderboardCache)
    .where(eq(schema.leaderboardCache.metric, metric))
    .orderBy(schema.leaderboardCache.rank)
    .limit(limit);
}

export async function recomputeFeatured() {
  if (USE_MOCK) return getFeaturedPools();
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
  };
}

function shortManager(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function syntheticLaunchPool(address: string): PoolCard | null {
  if (!address.startsWith("Vault") || address.length < 32) return null;

  return {
    address,
    name: "Phoenix Launch Pool",
    manager: "UnknownManager111111111111111111111111111",
    managerName: "on-chain",
    strategyTag: "Phoenix",
    description:
      "This pool launch was recorded on Solana. Metadata is still syncing into the Phoenix Vault registry.",
    aum: 0,
    pnl7d: 0,
    pnl30d: 0,
    perfFeeBps: 2000,
    mgmtFeeBps: 100,
    featured: false,
    depositorCount: 0,
    sharePrice: 1,
    navHistory: [],
  };
}
