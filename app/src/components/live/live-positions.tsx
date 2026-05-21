"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Activity, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLivePositions } from "@/hooks/use-phoenix-live";
import { formatUsd, cn } from "@/lib/utils";

type Props = {
  poolAddress: string;
  authorityHint?: string | null;
};

export function LivePositionsPanel({ poolAddress, authorityHint }: Props) {
  const { data, loading, lastUpdated } = useLivePositions(
    poolAddress,
    4000,
    authorityHint
  );

  return (
    <Card className="p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio
            className={cn(
              "h-4 w-4",
              loading ? "text-muted" : "text-positive animate-pulse"
            )}
          />
          <h3 className="font-semibold text-sm">Live Positions</h3>
        </div>
        <span className="text-[11px] text-muted tabular-nums">
          {lastUpdated
            ? `updated ${Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))}s ago`
            : "—"}
        </span>
      </header>

      {data && (
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-surface-2/30">
          <Cell label="Collateral" value={formatUsd(data.collateral)} />
          <Cell
            label="Unrealized PnL"
            value={
              <span
                className={cn(
                  data.unrealizedPnl >= 0 ? "text-positive" : "text-negative"
                )}
              >
                {data.unrealizedPnl >= 0 ? "+" : ""}
                {formatUsd(data.unrealizedPnl)}
              </span>
            }
          />
          <Cell label="Open Positions" value={data.positions.length} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted">
              <th className="text-left px-5 py-3">Market</th>
              <th className="text-left px-3 py-3">Side</th>
              <th className="text-right px-3 py-3">Size</th>
              <th className="text-right px-3 py-3">Entry</th>
              <th className="text-right px-3 py-3">Mark</th>
              <th className="text-right px-3 py-3">Lev</th>
              <th className="text-right px-5 py-3">uPnL</th>
            </tr>
          </thead>
          <tbody>
            {data?.positions.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-muted py-8 text-xs"
                >
                  <Activity className="h-4 w-4 inline mr-2" />
                  No open positions yet
                </td>
              </tr>
            )}
            {data?.positions.map((p) => {
              const positive = p.unrealizedPnl >= 0;
              const isLong = p.side === "long";
              return (
                <motion.tr
                  key={`${p.market}-${p.side}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-border/50 hover:bg-surface-2/30"
                >
                  <td className="px-5 py-3 font-mono text-xs">{p.market}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                        isLong
                          ? "bg-positive/15 text-positive"
                          : "bg-negative/15 text-negative"
                      )}
                    >
                      {isLong ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {p.side}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.baseQty.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    ${p.entryPrice.toLocaleString(undefined, {
                      maximumFractionDigits: p.entryPrice < 1 ? 6 : 2,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    ${p.markPrice.toLocaleString(undefined, {
                      maximumFractionDigits: p.markPrice < 1 ? 6 : 2,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">
                    {p.leverage.toFixed(1)}x
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right font-semibold tabular-nums",
                      positive ? "text-positive" : "text-negative"
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatUsd(p.unrealizedPnl)}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
