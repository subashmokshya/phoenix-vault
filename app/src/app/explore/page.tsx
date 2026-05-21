"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Compass, Rocket } from "lucide-react";
import { PoolCard } from "@/components/pool-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PoolCard as PoolCardType } from "@/lib/mock-data";
import { getAllLocalPools } from "@/lib/pools/local-pools";
import { cn } from "@/lib/utils";

const STRATEGIES = [
  "All",
  "Momentum",
  "Market Neutral",
  "Volatility",
  "Macro",
  "HFT",
  "Arbitrage",
  "Phoenix",
];
const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "pnl7d", label: "7D PnL" },
  { id: "aum", label: "AUM" },
] as const;

export default function ExplorePage() {
  const [strategy, setStrategy] = useState("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("newest");
  const [search, setSearch] = useState("");
  const [pools, setPools] = useState<PoolCardType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/pools?limit=200", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pools: [] }))
      .then((d) => {
        if (!active) return;
        const remote = (d.pools as PoolCardType[]) ?? [];
        const local = getAllLocalPools();
        const merged = dedupeByAddress([...remote, ...local]);
        setPools(merged);
      })
      .catch(() => {
        if (!active) return;
        setPools(getAllLocalPools());
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = [...pools];
    if (strategy !== "All") {
      list = list.filter((p) => p.strategyTag === strategy);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.managerName.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "pnl7d":
        list.sort((a, b) => b.pnl7d - a.pnl7d);
        break;
      case "aum":
        list.sort((a, b) => b.aum - a.aum);
        break;
      default:
        break;
    }
    return list;
  }, [pools, strategy, sort, search]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Explore</h1>
      <p className="text-muted mb-8">
        Real pools launched on Solana. Deposit USDC and let the manager trade
        Phoenix perps on your behalf.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input
          type="search"
          placeholder="Search pools, managers, or addresses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-11 px-4 rounded-full bg-surface-2 border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <div className="flex gap-2 flex-wrap">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                sort === s.id
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-8">
        {STRATEGIES.map((s) => (
          <button
            key={s}
            onClick={() => setStrategy(s)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
              strategy === s
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-muted hover:border-border-hover"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="text-center py-16">
          <p className="text-muted text-sm">Loading pools…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <Compass className="h-8 w-8 mx-auto text-muted" />
          <div>
            <h2 className="text-lg font-semibold">No pools yet</h2>
            <p className="text-sm text-muted mt-1">
              {pools.length === 0
                ? "Be the first to launch a Phoenix Vault pool on Solana."
                : "No pools match your filters."}
            </p>
          </div>
          {pools.length === 0 && (
            <Link href="/create">
              <Button>
                <Rocket className="h-4 w-4 mr-1.5" />
                Launch the first pool
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pool, i) => (
            <PoolCard key={pool.address} pool={pool} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function dedupeByAddress<T extends { address: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.address)) continue;
    seen.add(it.address);
    out.push(it);
  }
  return out;
}
