"use client";

import type { PoolCard } from "@/lib/mock-data";

export type RecoveryHint = {
  manager?: string | null;
  name?: string | null;
  strategyTag?: string | null;
  phoenixAuthority?: string | null;
};

/**
 * Constructs a minimal valid PoolCard from URL hints so that a freshly
 * launched pool is browsable even before the off-chain registry has synced.
 *
 * `address` is the deterministic PDA derived from (manager, vaultIndex), so
 * `manager` alone is enough to reconnect the pool to its trader authority and
 * surface live Phoenix data.
 */
export function recoveryPoolCard(
  address: string,
  hint: RecoveryHint
): PoolCard | null {
  const manager = hint.manager?.trim();
  if (!manager) return null;
  return {
    address,
    name: (hint.name ?? "Phoenix Pool").slice(0, 64),
    manager,
    managerName: `${manager.slice(0, 4)}…${manager.slice(-4)}`,
    strategyTag: hint.strategyTag ?? "Phoenix",
    description: "Pool launched on-chain. Registry sync pending.",
    aum: 0,
    pnl7d: 0,
    pnl30d: 0,
    perfFeeBps: 2000,
    mgmtFeeBps: 100,
    featured: false,
    depositorCount: 0,
    sharePrice: 1,
    navHistory: [],
    phoenixAuthority: hint.phoenixAuthority ?? manager,
  };
}
