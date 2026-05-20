"use client";

import { PoolCard } from "./pool-card";
import type { PoolCard as PoolCardType } from "@/lib/mock-data";

export function PoolRail({
  title,
  pools,
  subtitle,
}: {
  title: string;
  pools: PoolCardType[];
  subtitle?: string;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-5 px-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {pools.map((pool, i) => (
          <PoolCard key={pool.address} pool={pool} index={i} />
        ))}
      </div>
    </section>
  );
}
