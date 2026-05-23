"use client";

import {
  Activity,
  Pause,
  Play,
  RefreshCw,
  Trash2,
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

      {state.decisions.length === 0 ? (
        <p className="text-xs text-muted italic">
          No ticks yet. Arm the runner or click <strong>Run now</strong> to test the pipeline.
        </p>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            Latest: <strong className="text-foreground">{state.decisions[0]?.summary?.slice(0, 80) || "—"}</strong>
          </span>
          <button
            type="button"
            onClick={clearHistory}
            className="hover:text-foreground inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> clear local
          </button>
        </div>
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
