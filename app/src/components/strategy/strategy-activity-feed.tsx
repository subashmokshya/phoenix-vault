"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Hand,
  Hash,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStrategyLogs } from "@/hooks/use-strategy-logs";
import type { StrategyLogEntry } from "@/lib/registry/redis";

type FilterKind = "all" | "tick" | "order" | "spec" | "system";

type Props = {
  poolAddress: string;
  /** Heading override; default "Strategy Activity" */
  title?: string;
  /** Show source/manage badge on the right */
  audience?: "manager" | "public";
  intervalMs?: number;
  limit?: number;
  emptyHint?: string;
};

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "now";
  if (diff < 30_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(6)}`;
}

export function StrategyActivityFeed({
  poolAddress,
  title = "Strategy Activity",
  audience = "public",
  intervalMs = 6000,
  limit = 80,
  emptyHint,
}: Props) {
  const { entries, loading, error, lastUpdated } = useStrategyLogs(
    poolAddress,
    intervalMs,
    limit
  );
  const [filter, setFilter] = useState<FilterKind>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.kind === filter);
  }, [entries, filter]);

  const counts = useMemo(() => {
    const c = { tick: 0, order: 0, spec: 0, system: 0 };
    for (const e of entries) {
      if (e.kind === "tick") c.tick += 1;
      else if (e.kind === "order") c.order += 1;
      else if (e.kind === "spec") c.spec += 1;
      else if (e.kind === "system") c.system += 1;
    }
    return c;
  }, [entries]);

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-accent/15 text-accent flex items-center justify-center">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-[11px] text-muted">
              {audience === "manager"
                ? "Real-time AI ticks, orders, and spec edits — synced to depositors live."
                : "What the strategy is doing right now: AI decisions, on-chain orders, and rule changes."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              error
                ? "bg-negative"
                : lastUpdated
                  ? "bg-positive animate-pulse"
                  : "bg-muted"
            )}
          />
          {error ? "offline" : lastUpdated ? formatAgo(lastUpdated) : "syncing"}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All ${entries.length}`}
        />
        <FilterChip
          active={filter === "tick"}
          onClick={() => setFilter("tick")}
          label={`AI ticks ${counts.tick}`}
          icon={<Brain className="h-3 w-3" />}
        />
        <FilterChip
          active={filter === "order"}
          onClick={() => setFilter("order")}
          label={`Orders ${counts.order}`}
          icon={<Zap className="h-3 w-3" />}
        />
        <FilterChip
          active={filter === "spec"}
          onClick={() => setFilter("spec")}
          label={`Spec ${counts.spec}`}
          icon={<Sliders className="h-3 w-3" />}
        />
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-xs text-muted italic">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted italic">
          {emptyHint ??
            "No strategy activity yet. Once the manager sets up rules and arms the runner, decisions and orders show up here in real time."}
        </p>
      ) : (
        <ol className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((e) => (
            <LogRow key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors",
        active
          ? "bg-accent/15 border-accent/40 text-accent"
          : "bg-surface-2 border-border text-muted hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LogRow({ entry }: { entry: StrategyLogEntry }) {
  if (entry.kind === "tick") return <TickRow entry={entry} />;
  if (entry.kind === "order") return <OrderRow entry={entry} />;
  if (entry.kind === "spec") return <SpecRow entry={entry} />;
  return <SystemRow entry={entry} />;
}

function TickRow({
  entry,
}: {
  entry: Extract<StrategyLogEntry, { kind: "tick" }>;
}) {
  const decided =
    entry.proposedIds.length > 0
      ? `proposed ${entry.proposedIds.length}`
      : "hold";
  return (
    <motion.li
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-surface-2/60 px-3 py-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry.error ? (
            <XCircle className="h-3.5 w-3.5 text-negative shrink-0" />
          ) : entry.proposedIds.length > 0 ? (
            <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
          ) : (
            <CircleDashed className="h-3.5 w-3.5 text-muted shrink-0" />
          )}
          <span className="font-medium text-foreground">
            {entry.error ? "AI tick · error" : `AI tick · ${decided}`}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-3 text-muted">
            {entry.source}
          </span>
        </div>
        <span className="text-[10px] text-muted shrink-0">
          {formatAgo(entry.ts)}
        </span>
      </div>
      <p className={cn("mt-1 text-muted", entry.error && "text-negative")}>
        {entry.error || entry.summary}
      </p>
      {entry.actions.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-[11px]">
          {entry.actions.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5">
              {a.kind === "propose" ? (
                <Bot className="h-3 w-3 mt-0.5 text-accent shrink-0" />
              ) : a.kind === "note" ? (
                <Hash className="h-3 w-3 mt-0.5 text-muted shrink-0" />
              ) : (
                <Hand className="h-3 w-3 mt-0.5 text-muted shrink-0" />
              )}
              <span className="text-muted">
                {a.kind === "propose" ? (
                  <>
                    <span className="font-mono text-foreground">
                      {a.side.toUpperCase()} {a.market} ${a.sizeUsd.toLocaleString()}
                    </span>{" "}
                    <span className="text-muted">({a.orderType})</span>
                    {" — "}
                    {a.rationale}
                  </>
                ) : a.kind === "note" ? (
                  a.text
                ) : (
                  a.reason
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.li>
  );
}

function OrderRow({
  entry,
}: {
  entry: Extract<StrategyLogEntry, { kind: "order" }>;
}) {
  const isFilled = entry.status === "filled";
  const isRejected = entry.status === "rejected" || entry.status === "blocked";
  const SideIcon = entry.side === "buy" ? TrendingUp : TrendingDown;
  return (
    <motion.li
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-xs",
        isFilled
          ? "border-positive/30 bg-positive/5"
          : isRejected
            ? "border-negative/30 bg-negative/5"
            : "border-accent/30 bg-accent/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
              entry.side === "buy"
                ? "bg-positive/15 text-positive"
                : "bg-negative/15 text-negative"
            )}
          >
            <SideIcon className="h-3 w-3" />
          </span>
          <span className="font-mono text-foreground">
            {entry.side.toUpperCase()} {entry.market}
          </span>
          <span className="text-muted">
            ${entry.sizeUsd.toLocaleString()} · {entry.orderType}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full",
              isFilled
                ? "bg-positive/15 text-positive"
                : isRejected
                  ? "bg-negative/15 text-negative"
                  : "bg-accent/15 text-accent animate-pulse"
            )}
          >
            {entry.status}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full",
              entry.source === "runner"
                ? "bg-positive/15 text-positive"
                : entry.source === "manual"
                  ? "bg-accent/15 text-accent"
                  : "bg-surface-3 text-muted"
            )}
          >
            {entry.source}
          </span>
        </div>
        <span className="text-[10px] text-muted shrink-0">
          {formatAgo(entry.ts)}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] text-muted">
        {typeof entry.quantity === "number" && (
          <Fact label="qty" value={entry.quantity.toFixed(4)} />
        )}
        {typeof entry.referencePrice === "number" && (
          <Fact label="ref" value={formatPrice(entry.referencePrice)} />
        )}
        {typeof entry.collateralUsdc === "number" && (
          <Fact label="collateral" value={`$${entry.collateralUsdc.toFixed(2)}`} />
        )}
        {entry.estimatedLiquidationPriceUsd != null && (
          <Fact
            label="est. liq"
            value={formatPrice(entry.estimatedLiquidationPriceUsd)}
            highlight="negative"
          />
        )}
        {typeof entry.tpTrigger === "number" && (
          <Fact label="TP" value={formatPrice(entry.tpTrigger)} highlight="positive" />
        )}
        {typeof entry.slTrigger === "number" && (
          <Fact label="SL" value={formatPrice(entry.slTrigger)} highlight="negative" />
        )}
      </div>

      {entry.rationale && (
        <p className="mt-1 text-muted line-clamp-2">{entry.rationale}</p>
      )}

      {entry.error && (
        <p className="mt-1 text-negative flex items-start gap-1">
          <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{entry.error}</span>
        </p>
      )}

      {entry.signature && entry.explorerUrl && (
        <a
          href={entry.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline mt-1"
        >
          {entry.signature.slice(0, 8)}…{entry.signature.slice(-6)}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </motion.li>
  );
}

function SpecRow({
  entry,
}: {
  entry: Extract<StrategyLogEntry, { kind: "spec" }>;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-surface-2/60 px-3 py-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="font-medium text-foreground">
            Strategy spec edited
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-3 text-muted">
            {entry.source}
          </span>
        </div>
        <span className="text-[10px] text-muted shrink-0">
          {formatAgo(entry.ts)}
        </span>
      </div>
      <p className="mt-1 text-muted">{entry.summary}</p>
      {entry.changes.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
          {entry.changes.map((c, i) => (
            <li key={i}>· {c}</li>
          ))}
        </ul>
      )}
    </motion.li>
  );
}

function SystemRow({
  entry,
}: {
  entry: Extract<StrategyLogEntry, { kind: "system" }>;
}) {
  const Icon =
    entry.level === "error"
      ? XCircle
      : entry.level === "warn"
        ? AlertTriangle
        : CheckCircle2;
  const tone =
    entry.level === "error"
      ? "text-negative"
      : entry.level === "warn"
        ? "text-accent"
        : "text-muted";
  return (
    <motion.li
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-surface-2/40 px-3 py-2 text-xs flex items-start gap-2"
    >
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone)} />
      <div className="flex-1 min-w-0">
        <p className="text-foreground">{entry.summary}</p>
        <span className="text-[10px] text-muted">{formatAgo(entry.ts)}</span>
      </div>
    </motion.li>
  );
}

function Fact({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px]",
          highlight === "positive"
            ? "text-positive"
            : highlight === "negative"
              ? "text-negative"
              : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
