import "server-only";

import { PhoenixHttpClient } from "@ellipsis-labs/rise";
import type { PoolCard } from "@/lib/mock-data";

const PHOENIX_API_URL =
  process.env.NEXT_PUBLIC_PHOENIX_API_URL ?? "https://perp-api.phoenix.trade";

function createPhoenixHttp() {
  return new PhoenixHttpClient({ apiUrl: PHOENIX_API_URL });
}

export type LivePosition = {
  market: string;
  side: "long" | "short" | "flat";
  baseQty: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  notional: number;
};

export type LiveTrade = {
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

export type LiveSnapshot = {
  authority: string;
  source: "phoenix" | "demo";
  asOf: number;
  collateral: number;
  unrealizedPnl: number;
  positions: LivePosition[];
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (value && typeof value === "object" && "amount" in (value as object)) {
    const amt = (value as { amount?: unknown }).amount;
    return toNumber(amt, fallback);
  }
  return fallback;
}

export async function fetchLivePositions(
  authority: string
): Promise<LiveSnapshot | null> {
  try {
    const client = createPhoenixHttp();
    const state = await client
      .traders()
      .getTraderState(authority, { pdaIndex: 0 } as never);

    const trader = state.traders?.[0];
    if (!trader) return null;

    const positions: LivePosition[] = (trader.positions ?? []).map((p) => {
      const baseQty = toNumber((p as { baseLots?: unknown }).baseLots);
      const notional = Math.abs(
        toNumber((p as { positionValue?: unknown }).positionValue)
      );
      const entry = toNumber((p as { entryPrice?: unknown }).entryPrice);
      const mark = toNumber((p as { markPrice?: unknown }).markPrice);
      const upnl = toNumber((p as { unrealizedPnl?: unknown }).unrealizedPnl);
      const leverage =
        notional > 0
          ? notional / Math.max(1, toNumber(trader.effectiveCollateral))
          : 0;

      return {
        market: String((p as { marketSymbol?: unknown }).marketSymbol ?? "—"),
        side: baseQty > 0 ? "long" : baseQty < 0 ? "short" : "flat",
        baseQty: Math.abs(baseQty),
        entryPrice: entry,
        markPrice: mark,
        unrealizedPnl: upnl,
        leverage,
        notional,
      };
    });

    return {
      authority,
      source: "phoenix",
      asOf: Date.now(),
      collateral: toNumber(trader.collateralBalance),
      unrealizedPnl: toNumber(trader.unrealizedPnl),
      positions,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveTrades(
  authority: string,
  limit = 25
): Promise<LiveTrade[] | null> {
  try {
    const client = createPhoenixHttp();
    const res = await client.trades().getTraderTradesHistory(authority, {
      pdaIndex: 0,
      limit,
    });

    return (res.data ?? []).map((f) => {
      const price = toNumber(f.price);
      const baseDelta = toNumber(f.baseLotsDelta);
      const side: "buy" | "sell" = baseDelta >= 0 ? "buy" : "sell";
      const qty = Math.abs(baseDelta);
      const notional = qty * price;
      return {
        id: `${f.signature ?? "x"}-${f.eventIndex}-${f.instructionIndex}`,
        ts: f.timestamp * 1000,
        market: f.marketSymbol,
        side,
        price,
        qty,
        notional,
        liquidity: f.liquidity,
        signature: f.signature,
        realizedPnl: toNumber(f.realizedPnl),
        type: f.tradeType,
      };
    });
  } catch {
    return null;
  }
}

// ---------- Demo fallback (so freshly launched pools look alive) ----------

const MARKETS_BY_TAG: Record<string, string[]> = {
  Momentum: ["SOL-PERP", "BTC-PERP"],
  "Market Neutral": ["SOL-PERP", "BTC-PERP", "ETH-PERP"],
  Volatility: ["SOL-PERP", "BONK-PERP"],
  Macro: ["BTC-PERP", "ETH-PERP"],
  HFT: ["SOL-PERP"],
  Arbitrage: ["BTC-PERP", "ETH-PERP", "SOL-PERP"],
  Phoenix: ["SOL-PERP", "BTC-PERP"],
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const BASE_PRICE: Record<string, number> = {
  "SOL-PERP": 184.32,
  "BTC-PERP": 96412.5,
  "ETH-PERP": 3318.4,
  "BONK-PERP": 0.0000241,
};

export function demoSnapshot(pool: PoolCard): LiveSnapshot {
  const markets = MARKETS_BY_TAG[pool.strategyTag] ?? ["SOL-PERP"];
  const r = rng(hashSeed(pool.address));
  const now = Date.now();
  const drift = Math.sin(now / 60000 + hashSeed(pool.address) / 1e9);

  const positions: LivePosition[] = markets.map((m, i) => {
    const base = BASE_PRICE[m] ?? 100;
    const mark = base * (1 + (r() - 0.5) * 0.01 + drift * 0.002);
    const entry = base * (1 + (r() - 0.5) * 0.02);
    const sideSign = pool.strategyTag === "Market Neutral" && i % 2 === 1 ? -1 : 1;
    const qty = (5 + r() * 95) * (m === "BTC-PERP" ? 0.05 : 1);
    const notional = qty * mark;
    const upnl = sideSign * (mark - entry) * qty;
    return {
      market: m,
      side: sideSign > 0 ? "long" : "short",
      baseQty: qty,
      entryPrice: entry,
      markPrice: mark,
      unrealizedPnl: upnl,
      leverage: 2 + r() * 3,
      notional,
    };
  });

  return {
    authority: pool.phoenixAuthority ?? pool.manager,
    source: "demo",
    asOf: now,
    collateral: pool.aum > 0 ? pool.aum * 0.6 : 25_000 + r() * 75_000,
    unrealizedPnl: positions.reduce((s, p) => s + p.unrealizedPnl, 0),
    positions,
  };
}

export function demoTrades(pool: PoolCard, limit = 25): LiveTrade[] {
  const markets = MARKETS_BY_TAG[pool.strategyTag] ?? ["SOL-PERP"];
  const r = rng(hashSeed(pool.address) ^ 0xa5a5a5);
  const now = Date.now();
  const trades: LiveTrade[] = [];

  for (let i = 0; i < limit; i++) {
    const market = markets[Math.floor(r() * markets.length)]!;
    const base = BASE_PRICE[market] ?? 100;
    const price = base * (1 + (r() - 0.5) * 0.01);
    const qty = (1 + r() * 50) * (market === "BTC-PERP" ? 0.02 : 1);
    const side: "buy" | "sell" = r() > 0.48 ? "buy" : "sell";
    // Cluster trades into the recent past, more density near now
    const ageMs = Math.pow(r(), 2.2) * 6 * 60 * 60 * 1000;
    trades.push({
      id: `demo-${pool.address}-${i}`,
      ts: now - ageMs,
      market,
      side,
      price,
      qty,
      notional: qty * price,
      liquidity: r() > 0.5 ? "taker" : "maker",
      signature: null,
      realizedPnl: (r() - 0.5) * 20 * qty,
      type: r() > 0.7 ? "market" : "limit",
    });
  }

  return trades.sort((a, b) => b.ts - a.ts);
}
