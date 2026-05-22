"use client";

import {
  DEFAULT_SPEC,
  type ProposedTrade,
  type StrategySpec,
} from "@/lib/ai/strategy-ops-tools";

const SPEC_KEY = "phoenix-vault.strategy-spec";
const QUEUE_KEY = "phoenix-vault.proposed-trades";
const APPROVED_KEY = "phoenix-vault.approved-trades";

function specKey(addr: string) {
  return `${SPEC_KEY}:${addr}`;
}
function queueKey(addr: string) {
  return `${QUEUE_KEY}:${addr}`;
}
function approvedKey(addr: string) {
  return `${APPROVED_KEY}:${addr}`;
}

export function loadSpec(addr: string): StrategySpec {
  if (typeof window === "undefined") return DEFAULT_SPEC;
  try {
    const raw = window.localStorage.getItem(specKey(addr));
    if (!raw) return DEFAULT_SPEC;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SPEC, ...parsed };
  } catch {
    return DEFAULT_SPEC;
  }
}

export function saveSpec(addr: string, spec: StrategySpec): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(specKey(addr), JSON.stringify(spec));
  } catch {
    // ignore
  }
}

export function loadQueue(addr: string): ProposedTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(queueKey(addr));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(addr: string, queue: ProposedTrade[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      queueKey(addr),
      JSON.stringify(queue.slice(0, 50))
    );
  } catch {
    // ignore
  }
}

export type ApprovedTrade = ProposedTrade & {
  approvedAt: number;
  status: "queued" | "submitting" | "submitted" | "filled" | "rejected";
  mode?: "live";
  signature?: string;
  explorerUrl?: string;
  referencePrice?: number;
  quantity?: number;
  collateralUsdc?: number;
  estimatedLiquidationPriceUsd?: number | null;
  tpTrigger?: number;
  slTrigger?: number;
  error?: string;
  source?: "manual" | "ai" | "runner";
};

export function loadApproved(addr: string): ApprovedTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(approvedKey(addr));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveApproved(addr: string, list: ApprovedTrade[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      approvedKey(addr),
      JSON.stringify(list.slice(0, 100))
    );
  } catch {
    // ignore
  }
}
