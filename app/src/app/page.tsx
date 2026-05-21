import Link from "next/link";
import { Rocket } from "lucide-react";
import { Hero } from "@/components/hero";
import { PoolRail } from "@/components/pool-rail";
import { Stat } from "@/components/ui/stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listPools } from "@/lib/pools-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const pools = await listPools({ limit: 24 });

  const newest = pools.slice(0, 6);
  const featured = pools.filter((p) => p.featured).slice(0, 6);
  const byPnl = [...pools].sort((a, b) => b.pnl7d - a.pnl7d).slice(0, 6);
  const byAum = [...pools].sort((a, b) => b.aum - a.aum).slice(0, 6);
  const totalAum = pools.reduce((s, p) => s + p.aum, 0);
  const avgPnl7d =
    pools.length > 0 ? pools.reduce((s, p) => s + p.pnl7d, 0) / pools.length : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Hero />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 p-6 rounded-2xl border border-border bg-surface-1">
        <Stat label="Total AUM" value={totalAum} suffix="$" />
        <Stat label="Active Pools" value={pools.length} />
        <Stat
          label="Avg 7D Return"
          value={avgPnl7d}
          suffix="%"
          change={avgPnl7d}
        />
        <Stat label="Top Pool AUM" value={byAum[0]?.aum ?? 0} suffix="$" />
      </section>

      {pools.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <h2 className="text-2xl font-semibold">No pools yet</h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            Phoenix Vault is a Solana marketplace for AI-managed Phoenix perp
            pools. Launch the first pool and you&apos;ll headline the homepage.
          </p>
          <Link href="/create">
            <Button size="lg">
              <Rocket className="h-4 w-4 mr-1.5" />
              Launch a Pool
            </Button>
          </Link>
        </Card>
      ) : (
        <>
          {byPnl.length > 0 && (
            <PoolRail
              title="Top PnL This Week"
              subtitle="Highest 7-day returns across all vaults"
              pools={byPnl}
            />
          )}
          {featured.length > 0 && (
            <PoolRail
              title="Featured"
              subtitle="Curated by performance, AUM, and track record"
              pools={featured}
            />
          )}
          {byAum.length > 0 && <PoolRail title="Highest AUM" pools={byAum} />}
          {newest.length > 0 && <PoolRail title="Newest" pools={newest} />}
        </>
      )}
    </div>
  );
}
