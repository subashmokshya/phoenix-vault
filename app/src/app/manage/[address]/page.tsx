"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldOff, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PoolCard } from "@/lib/mock-data";
import { getLocalPool } from "@/lib/pools/local-pools";
import { recoveryPoolCard } from "@/lib/pools/recovery";
import { LivePositionsPanel } from "@/components/live/live-positions";
import { LiveTradeLog } from "@/components/live/live-trade-log";
import { StrategyEditor } from "@/components/strategy/strategy-editor";
import { StrategyCopilot } from "@/components/strategy/strategy-copilot";
import { ProposedTrades } from "@/components/strategy/proposed-trades";
import { InstantWithdrawalsAdmin } from "@/components/deposit/instant-withdrawals-admin";
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
import { useWallet } from "@/lib/wallet/context";
import { placePhoenixOrder } from "@/lib/phoenix/order-client";
import { formatUsd, cn } from "@/lib/utils";

export default function ManagePoolPage() {
  const params = useParams();
  const search = useSearchParams();
  const address = params.address as string;
  const managerHint = search?.get("manager") ?? null;
  const nameHint = search?.get("name") ?? null;
  const strategyHint = search?.get("strategy") ?? null;
  const fallback = useMemo(
    () =>
      getLocalPool(address) ??
      recoveryPoolCard(address, {
        manager: managerHint,
        name: nameHint,
        strategyTag: strategyHint,
      }),
    [address, managerHint, nameHint, strategyHint]
  );
  const [pool, setPool] = useState<PoolCard | null>(fallback);
  const [loading, setLoading] = useState(!fallback);
  const [spec, setSpec] = useState<StrategySpec>(DEFAULT_SPEC);
  const [queue, setQueue] = useState<ProposedTrade[]>([]);
  const [approved, setApproved] = useState<ApprovedTrade[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  const { connected, address: walletAddress } = useSolanaWallet();
  const { signAndSendTransaction } = useWallet();
  const phoenixAuthority = pool?.phoenixAuthority ?? pool?.manager ?? null;
  const positions = useLivePositions(address, 4000, phoenixAuthority);
  const trades = useLiveTrades(address, 4000, 25, phoenixAuthority);
  const [routingId, setRoutingId] = useState<string | null>(null);
  const [routeFlash, setRouteFlash] = useState<{
    kind: "ok" | "err" | "blocked";
    text: string;
    sig?: string;
    explorerUrl?: string;
  } | null>(null);

  const isManager = !!walletAddress && !!pool && walletAddress === pool.manager;

  const referencePriceFor = useCallback(
    (market: string): number => {
      const livePos = positions.data?.positions.find(
        (p) => p.market === market
      );
      if (livePos?.markPrice) return livePos.markPrice;
      const lastTrade = (trades.data ?? []).find((t) => t.market === market);
      if (lastTrade?.price) return lastTrade.price;
      return marketPrices[market] ?? 0;
    },
    [positions.data, trades.data, marketPrices]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/phoenix/markets", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as {
          markets?: { symbol: string; markPrice: number }[];
        };
        if (!active) return;
        const next: Record<string, number> = {};
        for (const m of json.markets ?? []) {
          if (m.markPrice > 0) next[m.symbol] = m.markPrice;
        }
        setMarketPrices(next);
      } catch {
        // best-effort
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

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

  const approveTrade = useCallback(
    async (t: ProposedTrade) => {
      if (!isManager || !walletAddress || !signAndSendTransaction) {
        setRouteFlash({
          kind: "err",
          text: "Connect the manager wallet to route orders.",
        });
        return;
      }
      setRoutingId(t.id);
      setRouteFlash(null);

      const referencePrice = referencePriceFor(t.market);
      if (!referencePrice) {
        setRouteFlash({
          kind: "err",
          text: `Reference price for ${t.market} unavailable yet — wait for the markets snapshot and retry.`,
        });
        return;
      }
      const leverage = Math.max(1, Math.round((spec.leverageMin + spec.leverageMax) / 2));
      const pendingEntry: ApprovedTrade = {
        ...t,
        approvedAt: Date.now(),
        status: "submitting",
        referencePrice,
      };
      setQueue((q) => q.filter((x) => x.id !== t.id));
      setApproved((a) => [pendingEntry, ...a]);

      try {
        const outcome = await placePhoenixOrder(
          {
            authority: walletAddress,
            market: t.market,
            side: t.side,
            orderType: t.orderType,
            sizeUsd: t.sizeUsd,
            limitPrice: t.limitPrice,
            referencePrice,
            takeProfitPct: spec.takeProfitPct,
            stopLossPct: spec.stopLossPct,
            leverage,
          },
          signAndSendTransaction
        );

        if (outcome.ok) {
          setApproved((a) =>
            a.map((row) =>
              row.id === t.id
                ? {
                    ...row,
                    status: "filled",
                    mode: "live",
                    signature: outcome.signature,
                    explorerUrl: outcome.explorerUrl,
                    quantity: outcome.quantity,
                    referencePrice: outcome.referencePrice,
                    tpTrigger: outcome.tpTrigger,
                    slTrigger: outcome.slTrigger,
                  }
                : row
            )
          );
          setRouteFlash({
            kind: "ok",
            text: `Routed ${t.side.toUpperCase()} ${t.market} on Phoenix.`,
            sig: outcome.signature,
            explorerUrl: outcome.explorerUrl,
          });
        } else {
          const detail = outcome.detail
            ? ` — ${outcome.detail}`
            : "";
          setApproved((a) =>
            a.map((row) =>
              row.id === t.id
                ? {
                    ...row,
                    status: "rejected",
                    mode: "live",
                    error: `${outcome.error}${detail}`,
                  }
                : row
            )
          );
          const blocked = outcome.kind === "blocked";
          setRouteFlash({
            kind: blocked ? "blocked" : "err",
            text: blocked
              ? `Phoenix beta access required for this wallet — order not routed.${detail}`
              : outcome.error,
          });
        }
      } catch (e) {
        setApproved((a) =>
          a.map((row) =>
            row.id === t.id
              ? {
                  ...row,
                  status: "rejected",
                  error: e instanceof Error ? e.message : String(e),
                }
              : row
          )
        );
        setRouteFlash({
          kind: "err",
          text: e instanceof Error ? e.message : "Order failed",
        });
      } finally {
        setRoutingId(null);
      }
    },
    [
      isManager,
      walletAddress,
      signAndSendTransaction,
      referencePriceFor,
      spec.leverageMin,
      spec.leverageMax,
      spec.takeProfitPct,
      spec.stopLossPct,
    ]
  );

  function dismissTrade(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  function proposeTrade(t: ProposedTrade) {
    if (spec.autoExecute && isManager) {
      void approveTrade(t);
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
          {pool && (
            <InstantWithdrawalsAdmin
              poolAddress={address}
              managerAddress={pool.manager}
              isManager={isManager}
              relayerAuthorized={pool.relayerAuthorized}
              onAuthorizationChange={(next) =>
                setPool((p) =>
                  p ? { ...p, relayerAuthorized: next } : p
                )
              }
            />
          )}
          {routeFlash && (
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm flex items-start gap-3",
                routeFlash.kind === "ok"
                  ? "border-positive/40 bg-positive/10 text-positive"
                  : routeFlash.kind === "blocked"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-negative/40 bg-negative/10 text-negative"
              )}
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{routeFlash.text}</div>
                {routeFlash.explorerUrl && (
                  <a
                    href={routeFlash.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-xs underline opacity-80"
                  >
                    View on Solana Explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button
                className="text-xs opacity-70 hover:opacity-100"
                onClick={() => setRouteFlash(null)}
              >
                dismiss
              </button>
            </div>
          )}
          <ProposedTrades
            trades={queue}
            onApprove={(t) => void approveTrade(t)}
            onDismiss={dismissTrade}
            autoExecute={spec.autoExecute}
            busyId={routingId}
            disabled={!isManager}
            disabledReason={
              !connected
                ? "Connect wallet to route orders."
                : !isManager
                  ? "Manager wallet required to sign Phoenix orders."
                  : undefined
            }
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
        {approved.slice(0, 8).map((t) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start justify-between gap-3 text-sm border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <span
                className={cn(
                  "inline-flex items-center justify-center h-6 w-6 mt-0.5 rounded-full text-[11px] font-bold shrink-0",
                  t.side === "buy"
                    ? "bg-positive/15 text-positive"
                    : "bg-negative/15 text-negative"
                )}
              >
                {t.side === "buy" ? "B" : "S"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{t.market}</span>
                  <span className="text-[10px] text-muted">
                    ${t.sizeUsd.toLocaleString()} · {t.orderType}
                    {t.quantity ? ` · ${t.quantity.toFixed(4)}` : ""}
                  </span>
                </div>
                {(t.tpTrigger || t.slTrigger) && (
                  <div className="text-[10px] text-muted mt-0.5">
                    {t.tpTrigger ? (
                      <span className="mr-2">
                        TP <span className="text-positive">${t.tpTrigger.toFixed(t.tpTrigger < 1 ? 6 : 2)}</span>
                      </span>
                    ) : null}
                    {t.slTrigger ? (
                      <span>
                        SL <span className="text-negative">${t.slTrigger.toFixed(t.slTrigger < 1 ? 6 : 2)}</span>
                      </span>
                    ) : null}
                  </div>
                )}
                {t.error && (
                  <div className="text-[10px] text-negative mt-0.5 truncate" title={t.error}>
                    {t.error}
                  </div>
                )}
                {t.explorerUrl && (
                  <a
                    href={t.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline mt-0.5"
                  >
                    {t.signature?.slice(0, 8)}…{t.signature?.slice(-6)}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                  t.status === "filled"
                    ? "bg-positive/15 text-positive"
                    : t.status === "rejected"
                      ? "bg-negative/15 text-negative"
                      : t.status === "submitting"
                        ? "bg-accent/15 text-accent animate-pulse"
                        : "bg-accent/15 text-accent"
                )}
              >
                {t.status}
              </span>
              {t.mode && (
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-full",
                    t.mode === "live"
                      ? "bg-positive/10 text-positive"
                      : "bg-surface-3 text-muted"
                  )}
                >
                  {t.mode}
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
      <p className="text-[10px] text-muted">
        Live trades route through the Phoenix isolated-order API with TP/SL triggers attached. Simulated entries indicate Phoenix beta access was unavailable for the signing wallet.
      </p>
    </Card>
  );
}
