"use client";

import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StrategyRunnerHandle } from "@/hooks/use-strategy-runner";

type Props = {
  runner: StrategyRunnerHandle;
  autoExecute: boolean;
  paused: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

function formatTimeAgo(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 30_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

function nextTickIn(nextRunAt: number | null): string {
  if (!nextRunAt) return "—";
  const diff = nextRunAt - Date.now();
  if (diff <= 0) return "any second";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
  return `${Math.round(diff / 60_000)}m`;
}

export function StrategyRunnerPanel({
  runner,
  autoExecute,
  paused,
  disabled,
  disabledReason,
}: Props) {
  const { state, enabled, setEnabled, setIntervalSec, running, lastRunAt, nextRunAt, runNow, clearHistory } =
    runner;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-accent/15 text-accent flex items-center justify-center">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <h3 className="font-semibold text-sm">Strategy Runner</h3>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full",
                enabled
                  ? running
                    ? "bg-accent/15 text-accent animate-pulse"
                    : "bg-positive/15 text-positive"
                  : "bg-surface-3 text-muted"
              )}
            >
              {enabled ? (running ? "evaluating" : "armed") : "off"}
            </span>
            {autoExecute && enabled && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                auto-execute
              </span>
            )}
            {paused && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger">
                paused
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Autonomous tick that evaluates your spec against live Phoenix data and
            {autoExecute
              ? " fires real orders on-chain when the entry rules trigger."
              : " queues proposals for you to approve."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || running}
            onClick={() => void runNow()}
            title={disabled ? disabledReason : "Run a single evaluation now"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", running && "animate-spin")} />
            <span className="ml-1">Run now</span>
          </Button>
          <Button
            size="sm"
            variant={enabled ? "primary" : "secondary"}
            disabled={disabled}
            onClick={() => setEnabled(!enabled)}
            title={disabled ? disabledReason : enabled ? "Disable the autonomous ticker" : "Enable the autonomous ticker"}
          >
            {enabled ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span className="ml-1">Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span className="ml-1">Arm</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric label="Last tick" value={formatTimeAgo(lastRunAt)} />
        <Metric label="Next tick" value={enabled ? nextTickIn(nextRunAt) : "—"} />
        <Metric label="Interval" value={`${state.intervalSec}s`} />
        <Metric label="History" value={String(state.decisions.length)} />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="text-muted">Tick interval</label>
        <input
          type="range"
          min={30}
          max={600}
          step={30}
          value={Math.min(600, state.intervalSec)}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
          className="flex-1 accent-accent"
          disabled={disabled}
        />
        <span className="font-mono tabular-nums w-12 text-right">
          {state.intervalSec}s
        </span>
      </div>

      {state.decisions.length > 0 ? (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {state.decisions.slice(0, 12).map((d) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/40 bg-surface-2/60 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {d.error ? (
                    <XCircle className="h-3.5 w-3.5 text-negative" />
                  ) : d.proposedIds.length > 0 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5 text-muted" />
                  )}
                  <span className="font-medium text-foreground">
                    {d.error
                      ? "error"
                      : d.proposedIds.length > 0
                        ? `proposed ${d.proposedIds.length}`
                        : "hold"}
                  </span>
                  <span className="text-muted">
                    {d.source === "manual" ? "manual" : "auto"} ·{" "}
                    {new Date(d.ts).toLocaleTimeString()}
                  </span>
                </div>
                {d.executedIds.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-positive/10 text-positive">
                    fired {d.executedIds.length}
                  </span>
                )}
              </div>
              <div className={cn("mt-1 text-muted", d.error && "text-negative")}>
                {d.error || d.summary}
              </div>
              {d.actions.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11px]">
                  {d.actions.map((a, i) => (
                    <li key={i} className="text-muted">
                      {a.kind === "propose"
                        ? `→ ${a.side.toUpperCase()} ${a.market} $${a.sizeUsd.toLocaleString()} (${a.orderType}) — ${a.rationale}`
                        : a.kind === "note"
                          ? `📝 ${a.text}`
                          : `· ${a.reason}`}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearHistory}
              className="text-[11px] text-muted hover:text-foreground inline-flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> clear history
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted italic">
          No ticks yet. Arm the runner or click <strong>Run now</strong> to test the pipeline.
        </p>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 border border-border/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="text-sm font-mono tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
