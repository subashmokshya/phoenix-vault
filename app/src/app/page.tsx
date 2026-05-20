import { Hero } from "@/components/hero";
import { PoolRail } from "@/components/pool-rail";
import { Stat } from "@/components/ui/stat";
import {
  DEMO_POOLS,
  getFeaturedPools,
  getTopPnlPools,
} from "@/lib/mock-data";
import { formatUsd } from "@/lib/utils";

export default function HomePage() {
  const featured = getFeaturedPools();
  const topPnl = getTopPnlPools(6);
  const newest = [...DEMO_POOLS]
    .sort((a, b) => b.depositorCount - a.depositorCount)
    .slice(0, 4);
  const highestAum = [...DEMO_POOLS].sort((a, b) => b.aum - a.aum).slice(0, 4);
  const totalAum = DEMO_POOLS.reduce((s, p) => s + p.aum, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Hero />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 p-6 rounded-2xl border border-border bg-surface-1">
        <Stat label="Total AUM" value={totalAum} suffix="$" />
        <Stat label="Active Pools" value={DEMO_POOLS.length} />
        <Stat
          label="Avg 7D Return"
          value={
            DEMO_POOLS.reduce((s, p) => s + p.pnl7d, 0) / DEMO_POOLS.length
          }
          suffix="%"
          change={
            DEMO_POOLS.reduce((s, p) => s + p.pnl7d, 0) / DEMO_POOLS.length
          }
        />
        <Stat
          label="Top Pool AUM"
          value={formatUsd(highestAum[0]?.aum ?? 0, true)}
        />
      </section>

      <PoolRail
        title="Top PnL This Week"
        subtitle="Highest 7-day returns across all vaults"
        pools={topPnl}
      />
      <PoolRail
        title="Featured"
        subtitle="Curated by performance, AUM, and track record"
        pools={featured}
      />
      <PoolRail title="Highest AUM" pools={highestAum} />
      <PoolRail title="Most Active" pools={newest} />
    </div>
  );
}
