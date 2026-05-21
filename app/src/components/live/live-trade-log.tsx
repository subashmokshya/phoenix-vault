"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, Radio, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLiveTrades } from "@/hooks/use-phoenix-live";
import { cn } from "@/lib/utils";

type Props = {
  poolAddress: string;
  authorityHint?: string | null;
};

export function LiveTradeLog({ poolAddress, authorityHint }: Props) {
  const { data, loading, lastUpdated } = useLiveTrades(
    poolAddress,
    4000,
    30,
    authorityHint
  );
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const fresh: string[] = [];
    for (const t of data) {
      if (!seenRef.current.has(t.id)) {
        seenRef.current.add(t.id);
        fresh.push(t.id);
      }
    }
    if (fresh.length === 0) return;
    setHighlighted((prev) => {
      const next = new Set(prev);
      fresh.forEach((id) => next.add(id));
      return next;
    });
    const timer = setTimeout(() => {
      setHighlighted((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.delete(id));
        return next;
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [data]);

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
          <h3 className="font-semibold text-sm">Live Trade Log</h3>
        </div>
        <span className="text-[11px] text-muted tabular-nums">
          {lastUpdated
            ? `streaming · ${Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))}s`
            : "connecting…"}
        </span>
      </header>

      <div className="max-h-[420px] overflow-y-auto">
        {(!data || data.length === 0) && !loading && (
          <div className="text-center text-muted py-10 text-xs">
            <Zap className="h-4 w-4 inline mr-2" />
            Waiting for the first fill…
          </div>
        )}
        <ul className="divide-y divide-border/50">
          <AnimatePresence initial={false}>
            {data?.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "px-5 py-3 flex items-center gap-3 text-sm transition-colors",
                  highlighted.has(t.id) && "bg-accent/10"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold",
                    t.side === "buy"
                      ? "bg-positive/15 text-positive"
                      : "bg-negative/15 text-negative"
                  )}
                >
                  {t.side === "buy" ? "B" : "S"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{t.market}</span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                        t.type === "market"
                          ? "bg-surface-3 text-foreground"
                          : t.type === "liquidation"
                            ? "bg-negative/20 text-negative"
                            : "bg-surface-3 text-muted"
                      )}
                    >
                      {t.type}
                    </span>
                    <span className="text-[10px] text-muted">{t.liquidity}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {timeAgo(t.ts)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium tabular-nums">
                    {t.qty.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}{" "}
                    @ ${formatPrice(t.price)}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] tabular-nums",
                      t.realizedPnl === 0
                        ? "text-muted"
                        : t.realizedPnl > 0
                          ? "text-positive"
                          : "text-negative"
                    )}
                  >
                    {t.realizedPnl > 0 && "+"}
                    {t.realizedPnl !== 0
                      ? `$${t.realizedPnl.toFixed(2)} rPnL`
                      : "—"}
                  </div>
                </div>
                {t.signature ? (
                  <a
                    href={`https://explorer.solana.com/tx/${t.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted/40" />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </Card>
  );
}

function formatPrice(p: number): string {
  if (p < 0.01) return p.toFixed(6);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
