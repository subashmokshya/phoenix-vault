"use client";

import type { PoolCard } from "@/lib/mock-data";

const STORAGE_KEY = "phoenix-vault.launched-pools";

export type LocalPoolInput = Pick<
  PoolCard,
  | "address"
  | "name"
  | "manager"
  | "strategyTag"
  | "description"
  | "perfFeeBps"
  | "mgmtFeeBps"
>;

export function saveLocalPool(input: LocalPoolInput): void {
  if (typeof window === "undefined") return;
  const pools = readLocalPools();
  const next = {
    ...toPoolCard(input),
    managerName: shortManager(input.manager),
  };
  const deduped = [next, ...pools.filter((p) => p.address !== input.address)];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, 25)));
}

export function getLocalPool(address: string): PoolCard | null {
  return readLocalPools().find((p) => p.address === address) ?? null;
}

function readLocalPools(): PoolCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toPoolCard(input: LocalPoolInput): PoolCard {
  return {
    address: input.address,
    name: input.name,
    manager: input.manager,
    managerName: shortManager(input.manager),
    strategyTag: input.strategyTag,
    description: input.description,
    aum: 0,
    pnl7d: 0,
    pnl30d: 0,
    perfFeeBps: input.perfFeeBps,
    mgmtFeeBps: input.mgmtFeeBps,
    featured: false,
    depositorCount: 0,
    sharePrice: 1,
    navHistory: [],
  };
}

function shortManager(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}
