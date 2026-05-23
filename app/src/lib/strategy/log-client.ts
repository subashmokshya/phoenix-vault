"use client";

import type { StrategyLogEntry } from "@/lib/registry/redis";

export type { StrategyLogEntry };

/**
 * Fire-and-forget POST so the manager's UI never blocks waiting on Redis.
 * Returns the resulting entry (or null on failure) for callers that want to
 * verify success — callers should generally not await this.
 */
export async function writeStrategyLog(
  poolAddress: string,
  entry: StrategyLogEntry
): Promise<StrategyLogEntry | null> {
  try {
    const res = await fetch("/api/strategy/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ poolAddress, entry }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { entry?: StrategyLogEntry };
    return data.entry ?? entry;
  } catch {
    return null;
  }
}

export function newLogId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
