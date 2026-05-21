import "server-only";

import { PhoenixHttpClient } from "@ellipsis-labs/rise";

const PHOENIX_API_URL =
  process.env.NEXT_PUBLIC_PHOENIX_API_URL ?? "https://perp-api.phoenix.trade";

export type MarketPrice = {
  symbol: string;
  markPrice: number;
  spotPrice: number | null;
  bid: number | null;
  ask: number | null;
};

let cache: { ts: number; data: MarketPrice[] } | null = null;
const TTL_MS = 4000;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export async function fetchMarkets(): Promise<MarketPrice[]> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.data;

  try {
    const client = new PhoenixHttpClient({ apiUrl: PHOENIX_API_URL });
    const rows = await client.markets().getMarkets();

    const data: MarketPrice[] = rows.map((row) => {
      const params = (row as { marketParams?: unknown }).marketParams as
        | {
            symbol?: string;
            spotPrice?: { price?: number | string } | null;
            markPriceTicks?: string | number;
            tickSize?: string | number;
            l2Orderbook?: {
              bids?: Array<[number, number]>;
              asks?: Array<[number, number]>;
              mid?: number | null;
            } | null;
          }
        | undefined;

      const symbol =
        params?.symbol ??
        String((row as { symbol?: string }).symbol ?? "UNKNOWN");
      const tickSize = toNumber(params?.tickSize, 0);
      const markPriceTicks = toNumber(params?.markPriceTicks, 0);
      const mark =
        tickSize > 0 && markPriceTicks > 0
          ? markPriceTicks * tickSize
          : toNumber(params?.l2Orderbook?.mid, 0);
      const spot = params?.spotPrice
        ? toNumber(params.spotPrice.price)
        : null;
      const bid = params?.l2Orderbook?.bids?.[0]?.[0] ?? null;
      const ask = params?.l2Orderbook?.asks?.[0]?.[0] ?? null;

      return {
        symbol,
        markPrice: mark || spot || (bid && ask ? (bid + ask) / 2 : 0),
        spotPrice: spot,
        bid,
        ask,
      };
    });

    cache = { ts: now, data };
    return data;
  } catch {
    return cache?.data ?? [];
  }
}

export async function priceMap(): Promise<Record<string, number>> {
  const list = await fetchMarkets();
  const out: Record<string, number> = {};
  for (const m of list) {
    if (m.markPrice > 0) out[m.symbol] = m.markPrice;
  }
  return out;
}
