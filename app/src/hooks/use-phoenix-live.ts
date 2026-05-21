"use client";

import { useEffect, useRef, useState } from "react";

export type LivePositionDTO = {
  market: string;
  side: "long" | "short" | "flat";
  baseQty: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  notional: number;
};

export type LiveSnapshotDTO = {
  authority: string;
  source: "phoenix";
  asOf: number;
  collateral: number;
  unrealizedPnl: number;
  positions: LivePositionDTO[];
};

export type LiveTradeDTO = {
  id: string;
  ts: number;
  market: string;
  side: "buy" | "sell";
  price: number;
  qty: number;
  notional: number;
  liquidity: "maker" | "taker";
  signature: string | null;
  realizedPnl: number;
  type: "limit" | "market" | "liquidation";
};

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

function useInterval(callback: () => void, ms: number) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function authorityParam(authority: string | null | undefined): string {
  return authority ? `?authority=${encodeURIComponent(authority)}` : "";
}

export function useLivePositions(
  poolAddress: string | null,
  intervalMs = 4000,
  authorityHint?: string | null
): State<LiveSnapshotDTO> & { refresh: () => void } {
  const [state, setState] = useState<State<LiveSnapshotDTO>>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const load = async () => {
    if (!poolAddress) return;
    try {
      const r = await fetch(
        `/api/phoenix/positions/${poolAddress}${authorityParam(authorityHint)}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setState({
        data: json.snapshot,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "load failed",
      }));
    }
  };

  useEffect(() => {
    if (!poolAddress) return;
    setState((s) => ({ ...s, loading: true }));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolAddress, authorityHint]);

  useInterval(() => {
    load();
  }, intervalMs);

  return { ...state, refresh: load };
}

export function useLiveTrades(
  poolAddress: string | null,
  intervalMs = 4000,
  limit = 25,
  authorityHint?: string | null
): State<LiveTradeDTO[]> & { refresh: () => void } {
  const [state, setState] = useState<State<LiveTradeDTO[]>>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
  });
  const seen = useRef<Set<string>>(new Set());

  const load = async () => {
    if (!poolAddress) return;
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (authorityHint) params.set("authority", authorityHint);
      const r = await fetch(
        `/api/phoenix/trades/${poolAddress}?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      const trades: LiveTradeDTO[] = json.trades ?? [];
      setState({
        data: trades,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
      trades.forEach((t) => seen.current.add(t.id));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "load failed",
      }));
    }
  };

  useEffect(() => {
    if (!poolAddress) return;
    seen.current = new Set();
    setState((s) => ({ ...s, loading: true }));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolAddress, authorityHint]);

  useInterval(() => {
    load();
  }, intervalMs);

  return { ...state, refresh: load };
}
