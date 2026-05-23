"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyOpsToolCall,
  STRATEGY_OPS_TOOLS,
  type ProposedTrade,
  type StrategyOpsToolCall,
  type StrategySpec,
} from "@/lib/ai/strategy-ops-tools";
import {
  buildRunnerContext,
  buildRunnerSystemPrompt,
} from "@/lib/ai/runner-prompt";
import { runAssistantTurn } from "@/lib/ai/groq-client";
import { getGroqKey } from "@/lib/ai/key-store";
import {
  loadRunnerState,
  saveRunnerState,
  type RunnerDecision,
  type RunnerState,
  DEFAULT_RUNNER_STATE,
} from "@/lib/strategy/runner-store";
import type {
  LivePositionDTO,
  LiveTradeDTO,
} from "./use-phoenix-live";

export type StrategyRunnerCallbacks = {
  onProposeTrade: (t: ProposedTrade, source: "runner") => Promise<void> | void;
  onUpdateSpec?: (next: StrategySpec) => void;
  onNote?: (text: string) => void;
  onDecision?: (d: RunnerDecision) => void;
};

export type StrategyRunnerHandle = {
  state: RunnerState;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  setIntervalSec: (s: number) => void;
  running: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runNow: () => Promise<void>;
  clearHistory: () => void;
};

const MIN_INTERVAL_SEC = 30;
const MAX_INTERVAL_SEC = 3600;

export function useStrategyRunner(params: {
  poolAddress: string;
  poolName: string;
  strategyTag: string;
  spec: StrategySpec;
  positions: LivePositionDTO[];
  trades: LiveTradeDTO[];
  prices: Record<string, number>;
  aumEstimateUsd: number;
  callbacks: StrategyRunnerCallbacks;
  enabledOverride?: boolean;
}): StrategyRunnerHandle {
  const {
    poolAddress,
    poolName,
    strategyTag,
    spec,
    positions,
    trades,
    prices,
    aumEstimateUsd,
    callbacks,
    enabledOverride,
  } = params;

  const [state, setState] = useState<RunnerState>(DEFAULT_RUNNER_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  // Refs to capture freshest values inside the interval callback without re-creating it
  const specRef = useRef(spec);
  const positionsRef = useRef(positions);
  const tradesRef = useRef(trades);
  const pricesRef = useRef(prices);
  const aumRef = useRef(aumEstimateUsd);
  const callbacksRef = useRef(callbacks);

  specRef.current = spec;
  positionsRef.current = positions;
  tradesRef.current = trades;
  pricesRef.current = prices;
  aumRef.current = aumEstimateUsd;
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!poolAddress) return;
    setState(loadRunnerState(poolAddress));
    setHydrated(true);
  }, [poolAddress]);

  useEffect(() => {
    if (hydrated) saveRunnerState(poolAddress, state);
  }, [poolAddress, state, hydrated]);

  const enabled =
    typeof enabledOverride === "boolean" ? enabledOverride : state.enabled;

  const tick = useCallback(
    async (source: "auto" | "manual") => {
      if (running) return;
      setRunning(true);

      const decisionId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ts = Date.now();

      try {
        const apiKey = getGroqKey();
        if (!apiKey) {
          throw new Error(
            "Strategy runner needs your Groq API key — set it from the AI co-pilot panel."
          );
        }

        const currentSpec = specRef.current;
        if (currentSpec.paused && source === "auto") {
          appendDecision({
            id: decisionId,
            ts,
            source,
            summary: "Strategy paused — skipping tick.",
            actions: [{ kind: "hold", reason: "paused" }],
            proposedIds: [],
            executedIds: [],
          });
          return;
        }

        const systemPrompt = buildRunnerSystemPrompt({
          poolName,
          strategyTag,
          spec: currentSpec,
        });
        const context = buildRunnerContext({
          positions: positionsRef.current,
          trades: tradesRef.current,
          prices: pricesRef.current,
          aumEstimateUsd: aumRef.current,
        });

        const turn = await runAssistantTurn({
          apiKey,
          history: [{ role: "user", content: context }],
          systemPrompt,
          tools: STRATEGY_OPS_TOOLS,
        });

        const actions: RunnerDecision["actions"] = [];
        const proposedIds: string[] = [];
        const executedIds: string[] = [];

        let workingSpec = currentSpec;

        for (const tc of turn.toolCalls) {
          const result = applyOpsToolCall(
            workingSpec,
            tc.call as unknown as StrategyOpsToolCall
          );
          workingSpec = result.next;

          if (result.proposedTrade) {
            const proposed = result.proposedTrade;
            actions.push({
              kind: "propose",
              market: proposed.market,
              side: proposed.side,
              sizeUsd: proposed.sizeUsd,
              orderType: proposed.orderType,
              rationale: proposed.rationale,
            });
            proposedIds.push(proposed.id);
            // Hand off to the page — autoExecute branch (route to chain) or queue.
            await callbacksRef.current.onProposeTrade(proposed, "runner");
            if (workingSpec.autoExecute) executedIds.push(proposed.id);
          } else if (result.note) {
            actions.push({ kind: "note", text: result.note.text });
            callbacksRef.current.onNote?.(result.note.text);
          }
        }

        // Allow the runner to commit spec mutations only via notes — never edit risk params from the tick.
        // (intentional: we don't call onUpdateSpec to avoid runaway changes)

        if (actions.length === 0) {
          const reason =
            (turn.message || "").trim() ||
            "No qualifying signal this tick.";
          actions.push({ kind: "hold", reason });
        }

        const summary =
          turn.message?.trim() ||
          (proposedIds.length
            ? `Proposed ${proposedIds.length} trade(s)`
            : "Held");

        appendDecision({
          id: decisionId,
          ts,
          source,
          summary,
          actions,
          proposedIds,
          executedIds,
        });
        setLastRunAt(ts);
      } catch (e) {
        appendDecision({
          id: decisionId,
          ts,
          source,
          summary: "Runner error",
          actions: [],
          proposedIds: [],
          executedIds: [],
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setRunning(false);
      }
    },
    [running, poolName, strategyTag]
  );

  function appendDecision(d: RunnerDecision) {
    setState((prev) => ({
      ...prev,
      decisions: [d, ...prev.decisions].slice(0, 50),
    }));
    callbacksRef.current.onDecision?.(d);
  }

  useEffect(() => {
    if (!hydrated) return;
    if (!enabled) return;
    const interval = Math.min(
      MAX_INTERVAL_SEC,
      Math.max(MIN_INTERVAL_SEC, state.intervalSec || 120)
    );

    // Immediately tick after a small grace, then on the interval.
    const grace = setTimeout(() => {
      void tick("auto");
    }, 2000);

    const id = setInterval(() => {
      void tick("auto");
    }, interval * 1000);

    return () => {
      clearTimeout(grace);
      clearInterval(id);
    };
  }, [hydrated, enabled, state.intervalSec, tick]);

  const setEnabled = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, enabled: v }));
  }, []);

  const setIntervalSec = useCallback((s: number) => {
    const clamped = Math.min(
      MAX_INTERVAL_SEC,
      Math.max(MIN_INTERVAL_SEC, Math.round(s))
    );
    setState((prev) => ({ ...prev, intervalSec: clamped }));
  }, []);

  const runNow = useCallback(async () => {
    await tick("manual");
  }, [tick]);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, decisions: [] }));
  }, []);

  const nextRunAt = useMemo(() => {
    if (!enabled || !lastRunAt) return null;
    return lastRunAt + state.intervalSec * 1000;
  }, [enabled, lastRunAt, state.intervalSec]);

  return {
    state,
    enabled,
    setEnabled,
    setIntervalSec,
    running,
    lastRunAt,
    nextRunAt,
    runNow,
    clearHistory,
  };
}
