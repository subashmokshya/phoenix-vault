"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPoolByAddress, type PoolCard } from "@/lib/mock-data";
import { getLocalPool } from "@/lib/pools/local-pools";
import { LivePositionsPanel } from "@/components/live/live-positions";
import { LiveTradeLog } from "@/components/live/live-trade-log";
import { StrategyEditor } from "@/components/strategy/strategy-editor";
import { StrategyCopilot } from "@/components/strategy/strategy-copilot";
import { ProposedTrades } from "@/components/strategy/proposed-trades";
import { PendingWithdrawals } from "@/components/deposit/pending-withdrawals";
import {
  useLivePositions,
  useLiveTrades,
} from "@/hooks/use-phoenix-live";
import {
  DEFAULT_SPEC,
  type ProposedTrade,
  type StrategySpec,
} from "@/lib/ai/strategy-ops-tools";
import {
  loadApproved,
  loadQueue,
  loadSpec,
  saveApproved,
  saveQueue,
  saveSpec,
  type ApprovedTrade,
} from "@/lib/strategy/store";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { formatUsd, cn } from "@/lib/utils";

export default function ManagePoolPage() {
  const params = useParams();
  const address = params.address as string;
  const fallback = useMemo(
    () => getPoolByAddress(address) ?? getLocalPool(address),
    [address]
  );
  const [pool, setPool] = useState<PoolCard | null>(fallback);
  const [loading, setLoading] = useState(!fallback);
  const [spec, setSpec] = useState<StrategySpec>(DEFAULT_SPEC);
  const [queue, setQueue] = useState<ProposedTrade[]>([]);
  const [approved, setApproved] = useState<ApprovedTrade[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const { connected, address: walletAddress } = useSolanaWallet();
  const positions = useLivePositions(address);
  const trades = useLiveTrades(address);

  const isManager = !!walletAddress && !!pool && walletAddress === pool.manager;

  useEffect(() => {
    let active = true;
    setLoading(!fallback);
    setPool(fallback);

    fetch(`/api/pools/${address}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.pool) setPool(d.pool);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [address, fallback]);

  useEffect(() => {
    if (!address) return;
    setSpec(loadSpec(address));
    setQueue(loadQueue(address));
    setApproved(loadApproved(address));
    setHydrated(true);
  }, [address]);

  useEffect(() => {
    if (hydrated) saveSpec(address, spec);
  }, [address, spec, hydrated]);

  useEffect(() => {
    if (hydrated) saveQueue(address, queue);
  }, [address, queue, hydrated]);

  useEffect(() => {
    if (hydrated) saveApproved(address, approved);
  }, [address, approved, hydrated]);

  function approveTrade(t: ProposedTrade) {
    setQueue((q) => q.filter((x) => x.id !== t.id));
    setApproved((a) => [
      { ...t, approvedAt: Date.now(), status: "submitted" },
      ...a,
    ]);
  }

  function dismissTrade(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  function proposeTrade(t: ProposedTrade) {
    if (spec.autoExecute) {
      approveTrade(t);
    } else {
      setQueue((q) => [t, ...q]);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-2">Loading manager…</h1>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-4">Pool not found</h1>
        <Link href="/explore" className="text-accent hover:underline">
          Back to Explore
        </Link>
      </div>
    );
  }

  const headerStats = positions.data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-muted">
              {pool.strategyTag}
            </span>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                spec.paused
                  ? "bg-danger/15 text-danger"
                  : "bg-positive/15 text-positive"
              )}
            >
              {spec.paused ? "paused" : "active"}
            </span>
            {spec.autoExecute && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                auto-execute
              </span>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Manage · {pool.name}
          </h1>
          <p className="text-muted mt-1 text-sm">
            Live monitor & AI strategy ops
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 h-8 rounded-full border",
                isManager
                  ? "border-positive text-positive bg-positive/10"
                  : "border-border text-muted"
              )}
            >
              {isManager ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {isManager ? "manager connected" : "view-only"}
            </div>
          )}
          <Link href={`/pool/${address}`}>
            <Button size="sm" variant="secondary">
              View public page
            </Button>
          </Link>
        </div>
      </div>

      {headerStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Collateral"
            value={formatUsd(headerStats.collateral)}
          />
          <KpiCard
            label="Unrealized PnL"
            value={
              <span
                className={cn(
                  headerStats.unrealizedPnl >= 0
                    ? "text-positive"
                    : "text-negative"
                )}
              >
                {headerStats.unrealizedPnl >= 0 ? "+" : ""}
                {formatUsd(headerStats.unrealizedPnl)}
              </span>
            }
          />
          <KpiCard
            label="Open Positions"
            value={String(headerStats.positions.length)}
          />
          <KpiCard
            label="Pending Proposals"
            value={
              <span
                className={cn(
                  queue.length > 0 ? "text-accent" : "text-foreground"
                )}
              >
                {queue.length}
              </span>
            }
          />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1.05fr] gap-6 items-start">
        <div className="space-y-6">
          <LivePositionsPanel poolAddress={address} />
          <PendingWithdrawals poolAddress={address} isManager={isManager} />
          <ProposedTrades
            trades={queue}
            onApprove={approveTrade}
            onDismiss={dismissTrade}
            autoExecute={spec.autoExecute}
          />
          <ApprovedTradesPanel approved={approved} />
          <LiveTradeLog poolAddress={address} />
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
          <div className="h-[520px] lg:flex-1 lg:min-h-[420px]">
            <StrategyCopilot
              poolName={pool.name}
              strategyTag={pool.strategyTag}
              spec={spec}
              onSpecChange={setSpec}
              onPropose={proposeTrade}
              positions={positions.data?.positions ?? []}
              recentTrades={trades.data ?? []}
            />
          </div>
          <div className="lg:overflow-y-auto lg:pr-1">
            <StrategyEditor
              spec={spec}
              onChange={setSpec}
              readOnly={!isManager && connected}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="py-3 px-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function ApprovedTradesPanel({ approved }: { approved: ApprovedTrade[] }) {
  if (approved.length === 0) return null;
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold text-sm">Approved Trade Queue</h3>
      <ul className="space-y-2">
        {approved.slice(0, 6).map((t) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold",
                  t.side === "buy"
                    ? "bg-positive/15 text-positive"
                    : "bg-negative/15 text-negative"
                )}
              >
                {t.side === "buy" ? "B" : "S"}
              </span>
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">{t.market}</div>
                <div className="text-[10px] text-muted">
                  ${t.sizeUsd.toLocaleString()} · {t.orderType}
                </div>
              </div>
            </div>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                t.status === "filled"
                  ? "bg-positive/15 text-positive"
                  : t.status === "rejected"
                    ? "bg-negative/15 text-negative"
                    : "bg-accent/15 text-accent"
              )}
            >
              {t.status}
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="text-[10px] text-muted">
        Approved trades are queued for routing through Phoenix Flight once the
        on-chain vault program is live on mainnet.
      </p>
    </Card>
  );
}
