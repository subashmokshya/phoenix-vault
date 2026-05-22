import "server-only";

import { PhoenixHttpClient } from "@ellipsis-labs/rise";

const PHOENIX_API_URL =
  process.env.NEXT_PUBLIC_PHOENIX_API_URL ?? "https://perp-api.phoenix.trade";
const FLIGHT_BUILDER_AUTHORITY =
  process.env.PHOENIX_FLIGHT_BUILDER && process.env.PHOENIX_FLIGHT_BUILDER.length > 0
    ? process.env.PHOENIX_FLIGHT_BUILDER
    : undefined;

export type SerializedAccountMeta = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type SerializedInstruction = {
  programId: string;
  keys: SerializedAccountMeta[];
  data: string; // base64
};

export type OrderBuildRequest = {
  authority: string;
  market: string; // e.g. "SOL-PERP"
  side: "buy" | "sell";
  orderType: "market" | "limit";
  sizeUsd: number;
  limitPrice?: number;
  referencePrice?: number; // mid/mark used to convert sizeUsd → quantity and to compute TP/SL triggers
  takeProfitPct?: number;
  stopLossPct?: number;
  transferUsdc?: number; // optional explicit collateral; defaults to sizeUsd / leverage
  leverage?: number;
  reduceOnly?: boolean;
  pdaIndex?: number;
};

export type OrderBuildResult = {
  ok: true;
  source: "phoenix";
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  referencePrice: number;
  collateralUsdc: number;
  estimatedLiquidationPriceUsd: number | null;
  tpTrigger?: number;
  slTrigger?: number;
  instructions: SerializedInstruction[];
  feePayer: string;
};

export type OrderBuildError = {
  ok: false;
  source: "phoenix" | "client";
  error: string;
  detail?: string;
  status?: number;
};

const SOLANA_KIT_ROLE_WRITABLE = 1;
const SOLANA_KIT_ROLE_READONLY_SIGNER = 2;
const SOLANA_KIT_ROLE_WRITABLE_SIGNER = 3;

function toBase64(bytes: Uint8Array | Buffer | ArrayBuffer | number[]): string {
  if (bytes instanceof Buffer) return bytes.toString("base64");
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bytes)).toString("base64");
  }
  if (Array.isArray(bytes)) return Buffer.from(bytes).toString("base64");
  return Buffer.from(bytes as Uint8Array).toString("base64");
}

type RawAccount = {
  address?: unknown;
  pubkey?: unknown;
  role?: number;
  isSigner?: boolean;
  isWritable?: boolean;
};

type RawInstruction = {
  programAddress?: unknown;
  programId?: unknown;
  accounts?: RawAccount[];
  keys?: RawAccount[];
  data?: Uint8Array | Buffer | number[] | ArrayBuffer;
};

function serializeInstruction(ix: RawInstruction): SerializedInstruction {
  const programId = String(ix.programAddress ?? ix.programId ?? "");
  const accountList: RawAccount[] = ix.accounts ?? ix.keys ?? [];
  const keys: SerializedAccountMeta[] = accountList.map((a) => {
    const role = typeof a.role === "number" ? a.role : undefined;
    const isSigner =
      typeof a.isSigner === "boolean"
        ? a.isSigner
        : role === SOLANA_KIT_ROLE_READONLY_SIGNER ||
          role === SOLANA_KIT_ROLE_WRITABLE_SIGNER;
    const isWritable =
      typeof a.isWritable === "boolean"
        ? a.isWritable
        : role === SOLANA_KIT_ROLE_WRITABLE ||
          role === SOLANA_KIT_ROLE_WRITABLE_SIGNER;
    return {
      pubkey: String(a.address ?? a.pubkey ?? ""),
      isSigner,
      isWritable,
    };
  });
  const data = ix.data ? toBase64(ix.data) : "";
  return { programId, keys, data };
}

function quantityFromSize(sizeUsd: number, price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Reference price required to size order");
  }
  const qty = sizeUsd / price;
  // Round to 6 decimals max
  return Math.max(0.0001, Number(qty.toFixed(6)));
}

function makeClient() {
  return new PhoenixHttpClient({ apiUrl: PHOENIX_API_URL });
}

function classifyPhoenixError(e: unknown): {
  status?: number;
  error: string;
  detail: string;
} {
  const detail = e instanceof Error ? e.message : String(e);
  // PhoenixHttpError carries `.status` and `.body`
  const status =
    typeof e === "object" && e !== null && "status" in (e as object)
      ? Number((e as { status?: unknown }).status)
      : undefined;

  if (status === 401 || status === 403) {
    return {
      status,
      error:
        "Phoenix beta access required — request access at phoenix.trade or whitelist this wallet.",
      detail,
    };
  }
  if (status === 404) {
    return {
      status,
      error: "Phoenix market not found or trader endpoint missing.",
      detail,
    };
  }
  if (status === 422 || status === 400) {
    return {
      status,
      error: "Phoenix rejected the order parameters.",
      detail,
    };
  }
  if (status && status >= 500) {
    return {
      status,
      error: "Phoenix API is temporarily unavailable. Try again shortly.",
      detail,
    };
  }
  return {
    status,
    error: "Phoenix order build failed",
    detail,
  };
}

export async function buildPhoenixOrder(
  req: OrderBuildRequest
): Promise<OrderBuildResult | OrderBuildError> {
  if (!req.authority || !req.market) {
    return { ok: false, source: "client", error: "Missing authority or market" };
  }
  if (!req.sizeUsd || req.sizeUsd <= 0) {
    return { ok: false, source: "client", error: "sizeUsd must be > 0" };
  }
  const referencePrice = req.referencePrice ?? 0;
  if (!referencePrice) {
    return {
      ok: false,
      source: "client",
      error: "Reference price unavailable — try again when live snapshot loads",
    };
  }

  const quantity = quantityFromSize(req.sizeUsd, referencePrice);
  const leverage = Math.max(1, req.leverage ?? 3);
  const collateralUsdc =
    req.transferUsdc !== undefined
      ? Math.max(0, req.transferUsdc)
      : Math.max(1, Number((req.sizeUsd / leverage).toFixed(2)));

  const sideLabel = req.side === "buy" ? "bid" : "ask";

  // Compute TP/SL trigger prices from referencePrice
  let tpTrigger: number | undefined;
  let slTrigger: number | undefined;
  if (req.takeProfitPct && req.takeProfitPct > 0) {
    tpTrigger =
      req.side === "buy"
        ? referencePrice * (1 + req.takeProfitPct / 100)
        : referencePrice * (1 - req.takeProfitPct / 100);
  }
  if (req.stopLossPct && req.stopLossPct > 0) {
    slTrigger =
      req.side === "buy"
        ? referencePrice * (1 - req.stopLossPct / 100)
        : referencePrice * (1 + req.stopLossPct / 100);
  }

  const tpSl =
    tpTrigger || slTrigger
      ? {
          ...(tpTrigger
            ? {
                takeProfitTriggerPrice: tpTrigger,
                takeProfitExecutionPrice: tpTrigger,
              }
            : {}),
          ...(slTrigger
            ? {
                stopLossTriggerPrice: slTrigger,
                stopLossExecutionPrice: slTrigger,
              }
            : {}),
          quantity,
          orderKind: "market",
        }
      : undefined;

  try {
    const client = makeClient();
    let response:
      | { instructions: unknown[]; estimatedLiquidationPriceUsd: number | null }
      | undefined;

    if (req.orderType === "market") {
      response = await client.orders().placeIsolatedMarketOrderEnhanced({
        authority: req.authority,
        symbol: req.market,
        side: sideLabel,
        quantity,
        transferAmount: collateralUsdc,
        pdaIndex: req.pdaIndex ?? 0,
        isReduceOnly: req.reduceOnly ?? false,
        flightBuilderAuthority: FLIGHT_BUILDER_AUTHORITY,
        tpSl,
      });
    } else {
      if (!req.limitPrice || req.limitPrice <= 0) {
        return {
          ok: false,
          source: "client",
          error: "limitPrice required for limit orders",
        };
      }
      response = await client.orders().placeIsolatedLimitOrderEnhanced({
        authority: req.authority,
        symbol: req.market,
        side: sideLabel,
        price: req.limitPrice,
        quantity,
        transferAmount: collateralUsdc,
        pdaIndex: req.pdaIndex ?? 0,
        isReduceOnly: req.reduceOnly ?? false,
        flightBuilderAuthority: FLIGHT_BUILDER_AUTHORITY,
        tpSl,
      });
    }

    const rawInstructions = response?.instructions ?? [];
    const instructions = rawInstructions
      .filter((ix): ix is RawInstruction => Boolean(ix && typeof ix === "object"))
      .map(serializeInstruction);

    if (instructions.length === 0) {
      return {
        ok: false,
        source: "phoenix",
        error: "Phoenix returned no instructions",
      };
    }

    return {
      ok: true,
      source: "phoenix",
      symbol: req.market,
      side: req.side,
      quantity,
      referencePrice,
      collateralUsdc,
      estimatedLiquidationPriceUsd: response?.estimatedLiquidationPriceUsd ?? null,
      tpTrigger,
      slTrigger,
      instructions,
      feePayer: req.authority,
    };
  } catch (e) {
    const { status, error, detail } = classifyPhoenixError(e);
    return {
      ok: false,
      source: "phoenix",
      error,
      detail,
      status,
    };
  }
}
