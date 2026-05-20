"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card } from "./ui/card";
import { Sparkline } from "./charts/sparkline";
import { formatPct, formatUsd, cn } from "@/lib/utils";
import type { PoolCard as PoolCardType } from "@/lib/mock-data";

export function PoolCard({ pool, index = 0 }: { pool: PoolCardType; index?: number }) {
  const positive = pool.pnl7d >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={`/pool/${pool.address}`}>
        <Card className="group cursor-pointer hover:bg-surface-2 min-w-[280px]">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                {pool.name}
              </h3>
              <p className="text-sm text-muted mt-0.5">{pool.managerName}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-surface-3 text-muted">
              {pool.strategyTag}
            </span>
          </div>
          <div className="h-10 mb-3">
            <Sparkline data={pool.navHistory} positive={positive} />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">AUM</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatUsd(pool.aum, true)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">7D</p>
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  positive ? "text-positive" : "text-negative"
                )}
              >
                {formatPct(pool.pnl7d)}
              </p>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
