import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const DEMO = [
  {
    address: "AlphaVault1111111111111111111111111111111",
    manager: "Mgr1111111111111111111111111111111111111",
    name: "Alpha Momentum",
    strategyTag: "Momentum",
    description: "Systematic momentum on SOL and BTC perps.",
    perfFeeBps: 2000,
    mgmtFeeBps: 100,
    featured: true,
  },
  {
    address: "BetaVault222222222222222222222222222222222",
    manager: "Mgr2222222222222222222222222222222222222",
    name: "Delta Neutral Yield",
    strategyTag: "Market Neutral",
    description: "Funding-rate arbitrage with delta-neutral positioning.",
    perfFeeBps: 1500,
    mgmtFeeBps: 50,
    featured: true,
  },
  {
    address: "GammaVault333333333333333333333333333333333",
    manager: "Mgr3333333333333333333333333333333333333",
    name: "Vol Harvest",
    strategyTag: "Volatility",
    description: "Short-vol carry with dynamic hedging.",
    perfFeeBps: 2500,
    mgmtFeeBps: 0,
    featured: true,
  },
];

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const sql = neon(url);
  const db = drizzle(sql, { schema });

  for (const pool of DEMO) {
    await db
      .insert(schema.pools)
      .values(pool)
      .onConflictDoNothing();
  }

  console.log(`Seeded ${DEMO.length} demo pools`);
}

seed().catch(console.error);
