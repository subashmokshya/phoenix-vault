"use client";

import Link from "next/link";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { DEMO_POOLS } from "@/lib/mock-data";
import { formatPct, formatUsd } from "@/lib/utils";

const MOCK_DEPOSITS = DEMO_POOLS.slice(0, 3).map((p, i) => ({
  pool: p,
  shares: 1000 * (i + 1),
  value: (1000 * (i + 1) * p.sharePrice) / 1000,
  pnl: p.pnl7d,
}));

export default function PortfolioPage() {
  const { connected, address, connect } = useSolanaWallet();

  const totalValue = MOCK_DEPOSITS.reduce((s, d) => s + d.value, 0);
  const weightedPnl =
    MOCK_DEPOSITS.reduce((s, d) => s + d.pnl * d.value, 0) / totalValue || 0;

  if (!connected || !address) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold mb-4">Your Portfolio</h1>
        <p className="text-muted mb-8">
          Connect your Solana wallet (Phantom, Solflare, etc.) to view deposits
          across vaults.
        </p>
        <Button size="lg" onClick={connect}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm font-mono text-muted">{address}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 p-6 rounded-2xl border border-border bg-surface-1">
        <Stat label="Total Value" value={totalValue} suffix="$" />
        <Stat label="Weighted 7D" value={weightedPnl} suffix="%" change={weightedPnl} />
        <Stat label="Active Vaults" value={MOCK_DEPOSITS.length} />
      </div>

      <div className="space-y-4">
        {MOCK_DEPOSITS.map(({ pool, value, pnl }) => (
          <Link key={pool.address} href={`/pool/${pool.address}`}>
            <Card className="flex items-center justify-between hover:bg-surface-2 cursor-pointer">
              <div>
                <h3 className="font-semibold">{pool.name}</h3>
                <p className="text-sm text-muted">{pool.managerName}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatUsd(value)}</p>
                <p
                  className={`text-sm tabular-nums ${
                    pnl >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {formatPct(pnl)} 7D
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
