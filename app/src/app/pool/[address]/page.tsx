"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PnlChart } from "@/components/charts/pnl-chart";
import { Stat } from "@/components/ui/stat";
import { Card } from "@/components/ui/card";
import { LivePositionsPanel } from "@/components/live/live-positions";
import { LiveTradeLog } from "@/components/live/live-trade-log";
import { DepositWidget } from "@/components/deposit/deposit-widget";
import { getPoolByAddress, type PoolCard } from "@/lib/mock-data";
import { getLocalPool } from "@/lib/pools/local-pools";
import { formatBps, cn } from "@/lib/utils";

const RANGES = ["1d", "7d", "30d", "all"] as const;

export default function PoolDetailPage() {
  const params = useParams();
  const poolAddress = params.address as string;
  const fallbackPool = useMemo(
    () => getPoolByAddress(poolAddress) ?? getLocalPool(poolAddress),
    [poolAddress]
  );
  const [pool, setPool] = useState<PoolCard | null>(fallbackPool);
  const [loading, setLoading] = useState(!fallbackPool);
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [navHistory, setNavHistory] = useState(fallbackPool?.navHistory ?? []);

  useEffect(() => {
    let active = true;
    setLoading(!fallbackPool);
    setPool(fallbackPool);
    setNavHistory(fallbackPool?.navHistory ?? []);

    fetch(`/api/pools/${poolAddress}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Pool not found");
        return r.json();
      })
      .then((d) => {
        if (!active || !d.pool) return;
        setPool(d.pool);
        setNavHistory(d.pool.navHistory ?? []);
      })
      .catch(() => {
        if (!active) return;
        const local = getLocalPool(poolAddress);
        if (local) {
          setPool(local);
          setNavHistory(local.navHistory);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [poolAddress, fallbackPool]);

  useEffect(() => {
    if (!pool) return;
    fetch(`/api/pools/${poolAddress}/nav?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.history?.length) setNavHistory(d.history);
      })
      .catch(() => {});
  }, [poolAddress, range, pool]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-2">Loading pool…</h1>
        <p className="text-muted">Syncing metadata from the registry.</p>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-4">Pool not found</h1>
        <Link href="/explore" className="text-accent hover:underline">
          Back to Explore
        </Link>
      </div>
    );
  }

  const positive = pool.pnl7d >= 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <div className="mb-6">
            <span className="text-xs px-2 py-1 rounded-full bg-surface-3 text-muted">
              {pool.strategyTag}
            </span>
            <h1 className="text-3xl font-semibold tracking-tight mt-3">
              {pool.name}
            </h1>
            <p className="text-muted mt-1">
              by{" "}
              <Link
                href={`/managers/${pool.manager}`}
                className="text-accent hover:underline"
              >
                {pool.managerName}
              </Link>
            </p>
            <p className="text-muted mt-4 leading-relaxed max-w-2xl">
              {pool.description}
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium uppercase",
                  range === r
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <Card className="mb-8 p-4">
            <PnlChart data={navHistory} positive={positive} />
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Stat label="AUM" value={pool.aum} suffix="$" />
            <Stat label="7D PnL" value={pool.pnl7d} suffix="%" change={pool.pnl7d} />
            <Stat label="30D PnL" value={pool.pnl30d} suffix="%" change={pool.pnl30d} />
            <Stat label="Share Price" value={pool.sharePrice.toFixed(3)} />
          </div>

          <div className="space-y-6 mb-8">
            <LivePositionsPanel poolAddress={poolAddress} />
            <LiveTradeLog poolAddress={poolAddress} />
          </div>

          <Card>
            <h3 className="font-semibold mb-4">Fee Structure</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">Performance Fee</p>
                <p className="font-medium">{formatBps(pool.perfFeeBps)}</p>
              </div>
              <div>
                <p className="text-muted">Management Fee</p>
                <p className="font-medium">{formatBps(pool.mgmtFeeBps)}</p>
              </div>
              <div>
                <p className="text-muted">Depositors</p>
                <p className="font-medium">{pool.depositorCount}</p>
              </div>
              <div>
                <p className="text-muted">Platform Split</p>
                <p className="font-medium">20% of perf fee</p>
              </div>
            </div>
          </Card>
        </div>

        <aside className="w-full lg:w-80 shrink-0">
          <div className="sticky top-24">
            <DepositWidget
              poolAddress={poolAddress}
              poolName={pool.name}
              managerAddress={pool.manager}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
