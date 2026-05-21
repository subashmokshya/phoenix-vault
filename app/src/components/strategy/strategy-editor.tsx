"use client";

import { Pause, Play, Sparkles, Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  MARKETS,
  SIDE_BIAS,
  type Market,
  type SideBias,
  type StrategySpec,
} from "@/lib/ai/strategy-ops-tools";
import { cn } from "@/lib/utils";

type Props = {
  spec: StrategySpec;
  onChange: (next: StrategySpec) => void;
  readOnly?: boolean;
};

export function StrategyEditor({ spec, onChange, readOnly }: Props) {
  const update = <K extends keyof StrategySpec>(key: K, value: StrategySpec[K]) =>
    onChange({ ...spec, [key]: value, updatedAt: Date.now() });

  const toggleMarket = (m: Market) => {
    if (readOnly) return;
    const present = spec.markets.includes(m);
    let next = present ? spec.markets.filter((x) => x !== m) : [...spec.markets, m];
    if (next.length === 0) next = [m];
    update("markets", next);
  };

  return (
    <Card className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h3 className="font-semibold">Live Strategy</h3>
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            label={spec.paused ? "Paused" : "Active"}
            icon={spec.paused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            on={!spec.paused}
            tone={spec.paused ? "danger" : "positive"}
            onChange={(v) => update("paused", !v)}
            disabled={readOnly}
          />
          <Toggle
            label={spec.autoExecute ? "Auto" : "Manual"}
            icon={<Bot className="h-3 w-3" />}
            on={spec.autoExecute}
            tone={spec.autoExecute ? "accent" : "muted"}
            onChange={(v) => update("autoExecute", v)}
            disabled={readOnly}
          />
        </div>
      </header>

      <Field label="Markets">
        <div className="flex flex-wrap gap-2">
          {MARKETS.map((m) => {
            const on = spec.markets.includes(m);
            return (
              <button
                key={m}
                type="button"
                disabled={readOnly}
                onClick={() => toggleMarket(m)}
                className={cn(
                  "text-xs font-mono px-3 h-8 rounded-full border transition-colors",
                  on
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted hover:border-border-hover",
                  readOnly && "opacity-60 cursor-not-allowed"
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Directional Bias">
        <div className="grid grid-cols-3 gap-2">
          {SIDE_BIAS.map((b) => (
            <button
              key={b}
              type="button"
              disabled={readOnly}
              onClick={() => update("sideBias", b as SideBias)}
              className={cn(
                "text-xs font-medium h-9 rounded-full border capitalize transition-colors",
                spec.sideBias === b
                  ? b === "long"
                    ? "border-positive text-positive bg-positive/10"
                    : b === "short"
                      ? "border-negative text-negative bg-negative/10"
                      : "border-accent text-accent bg-accent/10"
                  : "border-border text-muted hover:border-border-hover",
                readOnly && "opacity-60 cursor-not-allowed"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Leverage Min · ${spec.leverageMin.toFixed(1)}x`}>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={spec.leverageMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              const max = Math.max(v, spec.leverageMax);
              onChange({
                ...spec,
                leverageMin: v,
                leverageMax: max,
                updatedAt: Date.now(),
              });
            }}
            disabled={readOnly}
            className="w-full accent-accent"
          />
        </Field>
        <Field label={`Leverage Max · ${spec.leverageMax.toFixed(1)}x`}>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={spec.leverageMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              const min = Math.min(spec.leverageMin, v);
              onChange({
                ...spec,
                leverageMin: min,
                leverageMax: v,
                updatedAt: Date.now(),
              });
            }}
            disabled={readOnly}
            className="w-full accent-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Max Position · ${spec.maxPositionPct}% of AUM`}>
          <input
            type="range"
            min={1}
            max={100}
            value={spec.maxPositionPct}
            onChange={(e) => update("maxPositionPct", Number(e.target.value))}
            disabled={readOnly}
            className="w-full accent-accent"
          />
        </Field>
        <Field label={`Max Drawdown · ${spec.maxDrawdownPct}%`}>
          <input
            type="range"
            min={1}
            max={50}
            value={spec.maxDrawdownPct}
            onChange={(e) => update("maxDrawdownPct", Number(e.target.value))}
            disabled={readOnly}
            className="w-full accent-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Stop Loss · ${spec.stopLossPct}%`}>
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={spec.stopLossPct}
            onChange={(e) => update("stopLossPct", Number(e.target.value))}
            disabled={readOnly}
            className="w-full accent-negative"
          />
        </Field>
        <Field label={`Take Profit · ${spec.takeProfitPct}%`}>
          <input
            type="range"
            min={0.5}
            max={40}
            step={0.5}
            value={spec.takeProfitPct}
            onChange={(e) => update("takeProfitPct", Number(e.target.value))}
            disabled={readOnly}
            className="w-full accent-positive"
          />
        </Field>
      </div>

      <Field label="Entry Rules">
        <textarea
          value={spec.entryRules}
          onChange={(e) => update("entryRules", e.target.value)}
          rows={3}
          disabled={readOnly}
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none font-mono text-xs leading-relaxed"
        />
      </Field>

      <Field label="Exit Rules">
        <textarea
          value={spec.exitRules}
          onChange={(e) => update("exitRules", e.target.value)}
          rows={3}
          disabled={readOnly}
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none font-mono text-xs leading-relaxed"
        />
      </Field>

      {spec.notes && (
        <Field label="Strategy Journal">
          <div className="text-xs text-muted whitespace-pre-wrap max-h-32 overflow-y-auto bg-surface-2 rounded-xl p-3 border border-border">
            {spec.notes}
          </div>
        </Field>
      )}

      <p className="text-[11px] text-muted">
        Last updated {new Date(spec.updatedAt).toLocaleString()}
      </p>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wider block mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  icon,
  on,
  tone,
  onChange,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  on: boolean;
  tone: "positive" | "accent" | "danger" | "muted";
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-full border transition-colors",
        on
          ? tone === "positive"
            ? "border-positive text-positive bg-positive/10"
            : tone === "accent"
              ? "border-accent text-accent bg-accent/10"
              : tone === "danger"
                ? "border-danger text-danger bg-danger/10"
                : "border-border text-foreground bg-surface-2"
          : "border-border text-muted hover:border-border-hover",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
