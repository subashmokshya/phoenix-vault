"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  History,
  Pause,
  Play,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEMO_POOLS,
  type PoolCard,
} from "@/lib/mock-data";
import { getLocalPoolsByManager } from "@/lib/pools/local-pools";
import { loadQueue, loadSpec } from "@/lib/strategy/store";
import {
  listDeposits,
  listWithdrawals,
  type DepositEntry,
  type WithdrawalRequest,
} from "@/lib/deposits/store";
import {
  formatPct,
  formatUsd,
  cn,
  shortAddress,
} from "@/lib/utils";
import type {
  LiveSnapshotDTO,
} from "@/hooks/use-phoenix-live";

type ManagedPool = {
  pool: PoolCard;
  snapshot: LiveSnapshotDTO | null;
  proposals: number;
  paused: boolean;
  autoExecute: boolean;
};

export default function PortfolioPage() {
  const { connected, address, connect } = useSolanaWallet();

  const [deposits, setDeposits] = useState<
    {
      pool: PoolCard;
      shares: number;
      value: number;
      pnl: number;
      live: boolean;
    }[]
  >([]);
  const [depositLedger, setDepositLedger] = useState<DepositEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);

  useEffect(() => {
    if (!address) {
      setDeposits([]);
      setDepositLedger([]);
      setWithdrawals([]);
      return;
    }

    const ledger = listDeposits({ depositor: address });
    const wRecords = listWithdrawals({ depositor: address });
    setDepositLedger(ledger);
    setWithdrawals(wRecords);

    const grouped = new Map<string, number>();
    for (const d of ledger) {
      grouped.set(d.poolAddress, (grouped.get(d.poolAddress) ?? 0) + d.amount);
    }
    for (const w of wRecords) {
      if (w.status === "paid") {
        grouped.set(
          w.poolAddress,
          (grouped.get(w.poolAddress) ?? 0) - w.amount
        );
      }
    }

    async function resolve() {
      const entries = await Promise.all(
        Array.from(grouped.entries())
          .filter(([, v]) => v > 0)
          .map(async ([poolAddress, value]) => {
            const local =
              DEMO_POOLS.find((p) => p.address === poolAddress) ?? null;
            const remote: PoolCard | null = local
              ? null
              : await fetch(`/api/pools/${poolAddress}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((d) => (d?.pool as PoolCard | null) ?? null)
                  .catch(() => null);
            const pool =
              local ?? remote ?? {
                address: poolAddress,
                name: "Phoenix Pool",
                manager: address!,
                managerName: shortAddress(address!, 4),
                strategyTag: "Phoenix",
                description: "",
                aum: 0,
                pnl7d: 0,
                pnl30d: 0,
                perfFeeBps: 2000,
                mgmtFeeBps: 100,
                featured: false,
                depositorCount: 0,
                sharePrice: 1,
                navHistory: [],
              };
            return {
              pool,
              shares: value,
              value,
              pnl: pool.pnl7d,
              live: true,
            };
          })
      );
      setDeposits(entries);
    }
    resolve();
  }, [address]);

  const [managed, setManaged] = useState<ManagedPool[]>([]);
  const [loadingManaged, setLoadingManaged] = useState(false);

  useEffect(() => {
    if (!address) {
      setManaged([]);
      return;
    }

    let active = true;
    setLoadingManaged(true);

    async function loadManaged(wallet: string) {
      const remote: PoolCard[] = await fetch(`/api/pools?limit=200`)
        .then((r) => (r.ok ? r.json() : { pools: [] }))
        .then((d) => (d.pools as PoolCard[]) ?? [])
        .catch(() => []);
      const local = getLocalPoolsByManager(wallet);
      const merged = dedupeByAddress([
        ...remote.filter((p) => p.manager === wallet),
        ...local,
      ]);

      const enriched = await Promise.all(
        merged.map(async (pool) => {
          const snapshot = await fetch(`/api/phoenix/positions/${pool.address}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => (d?.snapshot as LiveSnapshotDTO | null) ?? null)
            .catch(() => null);
          const queue = loadQueue(pool.address);
          const spec = loadSpec(pool.address);
          return {
            pool,
            snapshot,
            proposals: queue.length,
            paused: spec.paused,
            autoExecute: spec.autoExecute,
          } satisfies ManagedPool;
        })
      );

      if (active) {
        setManaged(enriched);
        setLoadingManaged(false);
      }
    }

    loadManaged(address);
    return () => {
      active = false;
    };
  }, [address]);

  if (!connected || !address) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold mb-4">Your Portfolio</h1>
        <p className="text-muted mb-8">
          Connect your Solana wallet to view both your deposits and the pools
          you manage in one place.
        </p>
        <Button size="lg" onClick={connect}>
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  const totalDeposited = deposits.reduce((s, d) => s + d.value, 0);
  const weightedPnl =
    deposits.reduce((s, d) => s + d.pnl * d.value, 0) / (totalDeposited || 1);
  const totalManagedCollateral = managed.reduce(
    (s, m) => s + (m.snapshot?.collateral ?? 0),
    0
  );
  const totalManagedPnl = managed.reduce(
    (s, m) => s + (m.snapshot?.unrealizedPnl ?? 0),
    0
  );
  const totalPendingProposals = managed.reduce((s, m) => s + m.proposals, 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-muted mt-1 text-sm">
            Your deposits and managed pools in one view
          </p>
        </div>
        <p className="text-xs font-mono text-muted">{shortAddress(address, 6)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <Kpi label="Deposited Value" value={formatUsd(totalDeposited)} />
        <Kpi
          label="Deposit Weighted 7D"
          value={
            <span
              className={cn(
                weightedPnl >= 0 ? "text-positive" : "text-negative"
              )}
            >
              {formatPct(weightedPnl)}
            </span>
          }
        />
        <Kpi label="Active Deposits" value={String(deposits.length)} />
        <Kpi label="Pools Managed" value={String(managed.length)} />
        <Kpi
          label="Managed Collateral"
          value={formatUsd(totalManagedCollateral)}
        />
      </div>

      <section className="mb-12">
        <SectionHeader
          icon={<Settings className="h-4 w-4 text-accent" />}
          title="Pools You Manage"
          subtitle={
            managed.length === 0
              ? "You haven't launched a pool yet"
              : `${managed.length} active · ${formatUsd(totalManagedCollateral)} collateral · ${formatUsd(totalManagedPnl)} uPnL · ${totalPendingProposals} pending proposals`
          }
          action={
            <Link href="/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Launch new pool
              </Button>
            </Link>
          }
        />

        {loadingManaged && managed.length === 0 && (
          <Card>
            <p className="text-sm text-muted">Loading managed pools…</p>
          </Card>
        )}

        {!loadingManaged && managed.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-sm text-muted mb-4">
              Launch a pool with AI-designed strategy in under a minute.
            </p>
            <Link href="/create">
              <Button>Launch on Phoenix</Button>
            </Link>
          </Card>
        )}

        {managed.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {managed.map((m) => (
              <ManagedPoolCard key={m.pool.address} item={m} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-12">
        <SectionHeader
          icon={<BarChart3 className="h-4 w-4 text-accent" />}
          title="Your Deposits"
          subtitle={
            deposits.length === 0
              ? "No active deposits"
              : `${deposits.length} vaults · ${formatUsd(totalDeposited)} total`
          }
          action={
            <Link href="/explore">
              <Button size="sm" variant="secondary">
                Explore pools
              </Button>
            </Link>
          }
        />

        {deposits.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-sm text-muted">
              You haven&apos;t deposited into any pool yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {deposits.map(({ pool, value, pnl }) => (
              <Link key={pool.address} href={`/pool/${pool.address}`}>
                <Card className="flex items-center justify-between hover:bg-surface-2 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-3 text-muted">
                      {pool.strategyTag}
                    </span>
                    <div>
                      <h3 className="font-semibold leading-tight">
                        {pool.name}
                      </h3>
                      <p className="text-xs text-muted">{pool.managerName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatUsd(value)}
                    </p>
                    <p
                      className={cn(
                        "text-xs tabular-nums flex items-center justify-end gap-1",
                        pnl >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      {pnl >= 0 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {formatPct(pnl)} 7D
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {(depositLedger.length > 0 || withdrawals.length > 0) && (
        <section>
          <SectionHeader
            icon={<History className="h-4 w-4 text-accent" />}
            title="Recent Activity"
            subtitle={`${depositLedger.length} deposits · ${withdrawals.length} withdrawals`}
          />
          <Card>
            <ul className="divide-y divide-border/50">
              {mergeActivity(depositLedger, withdrawals).slice(0, 15).map(
                (a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-7 w-7 rounded-full",
                          a.kind === "deposit"
                            ? "bg-positive/15 text-positive"
                            : "bg-negative/15 text-negative"
                        )}
                      >
                        {a.kind === "deposit" ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div>
                        <div className="font-medium capitalize">
                          {a.kind === "deposit"
                            ? "Deposit"
                            : `Withdrawal · ${a.status}`}
                        </div>
                        <Link
                          href={`/pool/${a.poolAddress}`}
                          className="text-[11px] text-muted hover:text-accent font-mono"
                        >
                          {shortAddress(a.poolAddress, 6)}
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">
                          {a.kind === "deposit" ? "+" : "-"}
                          {formatUsd(a.amount)}
                        </div>
                        <div className="text-[11px] text-muted">
                          {new Date(a.ts).toLocaleString()}
                        </div>
                      </div>
                      {a.explorerUrl && (
                        <a
                          href={a.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted hover:text-accent"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                )
              )}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

type ActivityRow = {
  id: string;
  kind: "deposit" | "withdraw";
  poolAddress: string;
  amount: number;
  ts: number;
  status?: string;
  explorerUrl?: string;
};

function mergeActivity(
  deposits: DepositEntry[],
  withdrawals: WithdrawalRequest[]
): ActivityRow[] {
  const rows: ActivityRow[] = [
    ...deposits.map<ActivityRow>((d) => ({
      id: `d-${d.id}`,
      kind: "deposit",
      poolAddress: d.poolAddress,
      amount: d.amount,
      ts: d.ts,
      explorerUrl: d.explorerUrl,
    })),
    ...withdrawals.map<ActivityRow>((w) => ({
      id: `w-${w.id}`,
      kind: "withdraw",
      poolAddress: w.poolAddress,
      amount: w.amount,
      ts: w.resolvedAt ?? w.ts,
      status: w.status,
      explorerUrl: w.managerSignatureUrl,
    })),
  ];
  return rows.sort((a, b) => b.ts - a.ts);
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="py-3 px-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function ManagedPoolCard({ item }: { item: ManagedPool }) {
  const { pool, snapshot, proposals, paused, autoExecute } = item;
  const upnl = snapshot?.unrealizedPnl ?? 0;
  const collateral = snapshot?.collateral ?? 0;
  const positions = snapshot?.positions ?? [];
  const isDemo = snapshot?.source === "demo";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-3 text-muted">
                {pool.strategyTag}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                  paused
                    ? "bg-danger/15 text-danger"
                    : "bg-positive/15 text-positive"
                )}
              >
                {paused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {paused ? "paused" : "active"}
              </span>
              {autoExecute && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                  auto
                </span>
              )}
              {isDemo && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-3 text-muted">
                  simulated
                </span>
              )}
            </div>
            <h3 className="font-semibold leading-tight">{pool.name}</h3>
            <p className="text-[11px] font-mono text-muted mt-0.5">
              {shortAddress(pool.address, 6)}
            </p>
          </div>
          {proposals > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
              {proposals} pending
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Mini label="Collateral" value={formatUsd(collateral)} />
          <Mini
            label="uPnL"
            value={
              <span className={cn(upnl >= 0 ? "text-positive" : "text-negative")}>
                {upnl >= 0 ? "+" : ""}
                {formatUsd(upnl)}
              </span>
            }
          />
          <Mini label="Positions" value={String(positions.length)} />
        </div>

        {positions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {positions.slice(0, 4).map((p, i) => (
              <span
                key={i}
                className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded-full",
                  p.side === "long"
                    ? "bg-positive/10 text-positive"
                    : p.side === "short"
                      ? "bg-negative/10 text-negative"
                      : "bg-surface-3 text-muted"
                )}
              >
                {p.side === "long" ? "L" : p.side === "short" ? "S" : "F"} {p.market}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Link href={`/manage/${pool.address}`} className="flex-1">
            <Button size="sm" className="w-full">
              <Settings className="h-3.5 w-3.5 mr-1" />
              Manage
            </Button>
          </Link>
          <Link href={`/pool/${pool.address}`} className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              View public
            </Button>
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
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
