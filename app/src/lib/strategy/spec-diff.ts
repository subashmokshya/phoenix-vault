"use client";

import type { StrategySpec } from "@/lib/ai/strategy-ops-tools";

/**
 * Compute a human-readable list of changes between two strategy specs.
 * Returns an empty array if nothing material changed (e.g. only updatedAt).
 */
export function diffSpec(prev: StrategySpec, next: StrategySpec): string[] {
  const changes: string[] = [];

  if (prev.markets.join(",") !== next.markets.join(",")) {
    changes.push(
      `markets: ${prev.markets.join("/") || "—"} → ${next.markets.join("/") || "—"}`
    );
  }
  if (prev.sideBias !== next.sideBias) {
    changes.push(`bias: ${prev.sideBias} → ${next.sideBias}`);
  }
  if (
    prev.leverageMin !== next.leverageMin ||
    prev.leverageMax !== next.leverageMax
  ) {
    changes.push(
      `leverage: ${prev.leverageMin}–${prev.leverageMax}× → ${next.leverageMin}–${next.leverageMax}×`
    );
  }
  if (prev.maxPositionPct !== next.maxPositionPct) {
    changes.push(
      `maxPosition: ${prev.maxPositionPct}% → ${next.maxPositionPct}%`
    );
  }
  if (prev.stopLossPct !== next.stopLossPct) {
    changes.push(`stop: ${prev.stopLossPct}% → ${next.stopLossPct}%`);
  }
  if (prev.takeProfitPct !== next.takeProfitPct) {
    changes.push(`take: ${prev.takeProfitPct}% → ${next.takeProfitPct}%`);
  }
  if (prev.maxDrawdownPct !== next.maxDrawdownPct) {
    changes.push(
      `maxDrawdown: ${prev.maxDrawdownPct}% → ${next.maxDrawdownPct}%`
    );
  }
  if (prev.paused !== next.paused) {
    changes.push(next.paused ? "strategy paused" : "strategy resumed");
  }
  if (prev.autoExecute !== next.autoExecute) {
    changes.push(
      next.autoExecute ? "auto-execute ON" : "auto-execute OFF"
    );
  }
  if (prev.entryRules.trim() !== next.entryRules.trim()) {
    changes.push("entry rules updated");
  }
  if (prev.exitRules.trim() !== next.exitRules.trim()) {
    changes.push("exit rules updated");
  }

  return changes;
}

export function summarizeSpecChanges(changes: string[]): string {
  if (changes.length === 0) return "No material changes.";
  if (changes.length === 1) return changes[0];
  return `${changes.length} fields updated`;
}
