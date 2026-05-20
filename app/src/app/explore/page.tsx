"use client";

import { useState, useMemo } from "react";
import { PoolCard } from "@/components/pool-card";
import { DEMO_POOLS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STRATEGIES = ["All", "Momentum", "Market Neutral", "Volatility", "Macro", "HFT", "Arbitrage"];
const SORTS = [
  { id: "pnl7d", label: "7D PnL" },
  { id: "pnl30d", label: "30D PnL" },
  { id: "aum", label: "AUM" },
] as const;

export default function ExplorePage() {
  const [strategy, setStrategy] = useState("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("pnl7d");
  const [search, setSearch] = useState("");

  const pools = useMemo(() => {
    let list = [...DEMO_POOLS];
    if (strategy !== "All") {
      list = list.filter((p) => p.strategyTag === strategy);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.managerName.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "pnl7d":
        list.sort((a, b) => b.pnl7d - a.pnl7d);
        break;
      case "pnl30d":
        list.sort((a, b) => b.pnl30d - a.pnl30d);
        break;
      case "aum":
        list.sort((a, b) => b.aum - a.aum);
        break;
    }
    return list;
  }, [strategy, sort, search]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Explore</h1>
      <p className="text-muted mb-8">
        Discover vaults ranked by performance, strategy, and assets under management.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input
          type="search"
          placeholder="Search pools or managers…"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pools.map((pool, i) => (
          <PoolCard key={pool.address} pool={pool} index={i} />
        ))}
      </div>

      {pools.length === 0 && (
        <p className="text-center text-muted py-16">No pools match your filters.</p>
      )}
    </div>
  );
}
