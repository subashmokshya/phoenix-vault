"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StrategyLogEntry } from "@/lib/registry/redis";

type State = {
  entries: StrategyLogEntry[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

export function useStrategyLogs(
  poolAddress: string | null | undefined,
  intervalMs = 6000,
  limit = 80
): State & { refresh: () => Promise<void> } {
  const [state, setState] = useState<State>({
    entries: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!poolAddress) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch(
        `/api/strategy/log/${poolAddress}?limit=${limit}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries?: StrategyLogEntry[] };
      setState({
        entries: Array.isArray(data.entries) ? data.entries : [],
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "load failed",
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [poolAddress, limit]);

  useEffect(() => {
    if (!poolAddress) return;
    setState((prev) => ({ ...prev, loading: true }));
    void refresh();
  }, [poolAddress, refresh]);

  useEffect(() => {
    if (!poolAddress || intervalMs <= 0) return;
    const id = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [poolAddress, intervalMs, refresh]);

  return { ...state, refresh };
}
