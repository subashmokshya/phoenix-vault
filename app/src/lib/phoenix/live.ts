import "server-only";

import { PhoenixHttpClient } from "@ellipsis-labs/rise";

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
  source: "phoenix";
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
    if (!trader) {
      return {
        authority,
        source: "phoenix",
        asOf: Date.now(),
        collateral: 0,
        unrealizedPnl: 0,
        positions: [],
      };
    }

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

export function emptySnapshot(authority: string): LiveSnapshot {
  return {
    authority,
    source: "phoenix",
    asOf: Date.now(),
    collateral: 0,
    unrealizedPnl: 0,
    positions: [],
  };
}
