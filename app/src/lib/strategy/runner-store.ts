"use client";

export type RunnerDecisionAction =
  | { kind: "propose"; market: string; side: "buy" | "sell"; sizeUsd: number; orderType: "market" | "limit"; rationale: string }
  | { kind: "hold"; reason: string }
  | { kind: "note"; text: string };

export type RunnerDecision = {
  id: string;
  ts: number;
  source: "auto" | "manual";
  summary: string;
  actions: RunnerDecisionAction[];
  proposedIds: string[];
  executedIds: string[];
  error?: string;
};

const RUNNER_KEY = "phoenix-vault.strategy-runner";

function runnerKey(addr: string) {
  return `${RUNNER_KEY}:${addr}`;
}

export type RunnerState = {
  enabled: boolean;
  intervalSec: number;
  decisions: RunnerDecision[];
};

export const DEFAULT_RUNNER_STATE: RunnerState = {
  enabled: false,
  intervalSec: 120,
  decisions: [],
};

export function loadRunnerState(addr: string): RunnerState {
  if (typeof window === "undefined") return DEFAULT_RUNNER_STATE;
  try {
    const raw = window.localStorage.getItem(runnerKey(addr));
    if (!raw) return DEFAULT_RUNNER_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_RUNNER_STATE,
      ...parsed,
      decisions: Array.isArray(parsed?.decisions)
        ? parsed.decisions.slice(0, 50)
        : [],
    };
  } catch {
    return DEFAULT_RUNNER_STATE;
  }
}

export function saveRunnerState(addr: string, state: RunnerState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      runnerKey(addr),
      JSON.stringify({
        ...state,
        decisions: state.decisions.slice(0, 50),
      })
    );
  } catch {
    // ignore
  }
}
