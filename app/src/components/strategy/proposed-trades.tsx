"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Bot, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProposedTrade } from "@/lib/ai/strategy-ops-tools";
import { cn } from "@/lib/utils";

type Props = {
  trades: ProposedTrade[];
  onApprove: (t: ProposedTrade) => void;
  onDismiss: (id: string) => void;
  autoExecute: boolean;
};

export function ProposedTrades({ trades, onApprove, onDismiss, autoExecute }: Props) {
  return (
    <Card className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" />
          <h3 className="font-semibold">Proposed Trades</h3>
          {trades.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {trades.length} pending
            </span>
          )}
        </div>
        {autoExecute && (
          <span className="flex items-center gap-1 text-[11px] text-accent">
            <AlertCircle className="h-3 w-3" />
            auto-execute on
          </span>
        )}
      </header>

      {trades.length === 0 ? (
        <div className="text-center text-muted text-xs py-6">
          No proposals yet. Ask StrategyOps to suggest a trade.
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {trades.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30 }}
                className="rounded-xl border border-border bg-surface-2/40 p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold",
                        t.side === "buy"
                          ? "bg-positive/15 text-positive"
                          : "bg-negative/15 text-negative"
                      )}
                    >
                      {t.side === "buy" ? "B" : "S"}
                    </span>
                    <div>
                      <div className="font-mono text-sm">{t.market}</div>
                      <div className="text-[11px] text-muted">
                        ${t.sizeUsd.toLocaleString()} · {t.orderType}
                        {t.limitPrice ? ` @ $${t.limitPrice}` : ""}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                      t.confidence === "high"
                        ? "bg-positive/15 text-positive"
                        : t.confidence === "low"
                          ? "bg-negative/15 text-negative"
                          : "bg-accent/15 text-accent"
                    )}
                  >
                    {t.confidence}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  {t.rationale}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => onApprove(t)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Approve & route
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onDismiss(t.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
