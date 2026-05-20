import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pools = pgTable(
  "pools",
  {
    address: text("address").primaryKey(),
    manager: text("manager").notNull(),
    name: text("name").notNull(),
    description: text("description").default(""),
    strategyTag: text("strategy_tag").notNull(),
    avatarUrl: text("avatar_url"),
    perfFeeBps: integer("perf_fee_bps").notNull().default(2000),
    mgmtFeeBps: integer("mgmt_fee_bps").notNull().default(100),
    platformFeeBps: integer("platform_fee_bps").notNull().default(2000),
    featured: boolean("featured").notNull().default(false),
    phoenixAuthority: text("phoenix_authority"),
    vaultIndex: integer("vault_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    managerIdx: index("pools_manager_idx").on(t.manager),
    featuredIdx: index("pools_featured_idx").on(t.featured),
    createdIdx: index("pools_created_idx").on(t.createdAt),
  })
);

export const navSnapshots = pgTable(
  "nav_snapshots",
  {
    id: text("id").primaryKey(),
    poolAddress: text("pool_address")
      .notNull()
      .references(() => pools.address),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    nav: real("nav").notNull(),
    totalShares: real("total_shares").notNull().default(0),
    sharePrice: real("share_price").notNull().default(1),
    unrealizedPnl: real("unrealized_pnl").notNull().default(0),
    realizedPnl: real("realized_pnl").notNull().default(0),
    aum: real("aum").notNull().default(0),
  },
  (t) => ({
    poolTsIdx: index("nav_pool_ts_idx").on(t.poolAddress, t.ts),
  })
);

export const depositors = pgTable(
  "depositors",
  {
    id: text("id").primaryKey(),
    poolAddress: text("pool_address")
      .notNull()
      .references(() => pools.address),
    depositor: text("depositor").notNull(),
    shares: real("shares").notNull().default(0),
    costBasis: real("cost_basis").notNull().default(0),
    firstDepositAt: timestamp("first_deposit_at", { withTimezone: true }),
  },
  (t) => ({
    uniqueDepositor: uniqueIndex("depositors_unique").on(
      t.poolAddress,
      t.depositor
    ),
  })
);

export const managers = pgTable("managers", {
  wallet: text("wallet").primaryKey(),
  displayName: text("display_name").notNull(),
  bio: text("bio").default(""),
  twitter: text("twitter"),
  avatarUrl: text("avatar_url"),
  totalAum: real("total_aum").notNull().default(0),
  weightedPnl: real("weighted_pnl").notNull().default(0),
  poolCount: integer("pool_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leaderboardCache = pgTable(
  "leaderboard_cache",
  {
    id: text("id").primaryKey(),
    poolAddress: text("pool_address")
      .notNull()
      .references(() => pools.address),
    manager: text("manager").notNull(),
    metric: text("metric").notNull(),
    rank: integer("rank").notNull(),
    value: real("value").notNull(),
    pnl7d: real("pnl_7d").notNull().default(0),
    pnl30d: real("pnl_30d").notNull().default(0),
    aum: real("aum").notNull().default(0),
    sharpe7d: real("sharpe_7d").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    metricRankIdx: index("leaderboard_metric_rank").on(t.metric, t.rank),
  })
);

export type Pool = typeof pools.$inferSelect;
export type NewPool = typeof pools.$inferInsert;
export type NavSnapshot = typeof navSnapshots.$inferSelect;
export type Manager = typeof managers.$inferSelect;
export type LeaderboardEntry = typeof leaderboardCache.$inferSelect;
