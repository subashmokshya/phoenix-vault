"use client";

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MARKETS, type Market } from "@/lib/ai/strategy-ops-tools";

type Props = {
  prices: Record<string, number>;
  disabled?: boolean;
  disabledReason?: string;
  onPlace: (input: {
    market: Market;
    side: "buy" | "sell";
    sizeUsd: number;
    leverage: number;
  }) => Promise<void> | void;
};

export function ManualOrderPanel({
  prices,
  disabled,
  disabledReason,
  onPlace,
}: Props) {
  const [market, setMarket] = useState<Market>("SOL-PERP");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sizeUsd, setSizeUsd] = useState(100);
  const [leverage, setLeverage] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  const refPrice = prices[market] ?? 0;

  async function submit() {
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      await onPlace({ market, side, sizeUsd, leverage });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-accent/15 text-accent flex items-center justify-center">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <h3 className="font-semibold text-sm">Manual order</h3>
        <span className="text-[10px] text-muted ml-1">
          Place a real Phoenix order directly — bypasses the AI runner.
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as Market)}
          disabled={disabled || submitting}
          className="h-9 rounded-lg bg-surface-2 border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 col-span-2 sm:col-span-1"
        >
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-border overflow-hidden col-span-2 sm:col-span-1">
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={() => setSide("buy")}
            className={cn(
              "flex-1 h-9 text-xs font-semibold",
              side === "buy"
                ? "bg-positive/20 text-positive"
                : "bg-surface-2 text-muted hover:text-foreground"
            )}
          >
            BUY
          </button>
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={() => setSide("sell")}
            className={cn(
              "flex-1 h-9 text-xs font-semibold border-l border-border",
              side === "sell"
                ? "bg-negative/20 text-negative"
                : "bg-surface-2 text-muted hover:text-foreground"
            )}
          >
            SELL
          </button>
        </div>
        <label className="flex items-center gap-1 col-span-1">
          <span className="text-[10px] text-muted">$</span>
          <input
            type="number"
            value={sizeUsd}
            onChange={(e) => setSizeUsd(Math.max(0, Number(e.target.value)))}
            min={1}
            step={10}
            disabled={disabled || submitting}
            className="h-9 w-full rounded-lg bg-surface-2 border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="size USD"
          />
        </label>
        <label className="flex items-center gap-1 col-span-1">
          <span className="text-[10px] text-muted">×</span>
          <input
            type="number"
            value={leverage}
            onChange={(e) => setLeverage(Math.max(1, Number(e.target.value)))}
            min={1}
            max={20}
            step={1}
            disabled={disabled || submitting}
            className="h-9 w-full rounded-lg bg-surface-2 border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="leverage"
          />
        </label>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || submitting || sizeUsd <= 0 || !refPrice}
          className="col-span-2 sm:col-span-1"
          title={
            disabled
              ? disabledReason
              : !refPrice
                ? "Waiting for live price"
                : `Place ${side.toUpperCase()} ${market}`
          }
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          <span className="ml-1">
            {submitting ? "Routing…" : "Place order"}
          </span>
        </Button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          Reference {market}: {refPrice ? `$${refPrice.toFixed(refPrice < 1 ? 6 : 2)}` : "loading…"}
        </span>
        <span>
          Notional ${sizeUsd.toLocaleString()} · ~${(sizeUsd / leverage).toFixed(2)} collateral
        </span>
      </div>
    </Card>
  );
}
