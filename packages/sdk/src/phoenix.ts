import {
  PhoenixHttpClient,
  createPhoenixClient,
  Side,
  flight,
} from "@ellipsis-labs/rise";

export const PHOENIX_API_URL =
  process.env.NEXT_PUBLIC_PHOENIX_API_URL ?? "https://perp-api.phoenix.trade";

export const PHOENIX_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

export function createPhoenixHttp() {
  return new PhoenixHttpClient({ apiUrl: PHOENIX_API_URL });
}

export function createPhoenixTradingClient(builderAuthority?: string) {
  return createPhoenixClient({
    apiUrl: PHOENIX_API_URL,
    rpcUrl: PHOENIX_RPC_URL,
    ws: false,
    exchangeMetadata: { stream: false },
    ...(builderAuthority
      ? {
          flight: {
            builderAuthority,
            builderPdaIndex: 0,
            builderSubaccountIndex: 0,
          },
        }
      : {}),
  });
}

export async function fetchTraderPnl(authority: string) {
  const client = createPhoenixHttp();
  return client.traders().getTraderPnl(authority);
}

export async function fetchTraderState(authority: string) {
  const client = createPhoenixHttp();
  return client.traders().getTraderStateSnapshot(authority, {
    traderPdaIndex: 0,
  });
}

export async function buildFlightMarketOrder(params: {
  traderAuthority: string;
  builderAuthority: string;
  symbol: string;
  side: "buy" | "sell";
  baseUnits: string;
}) {
  const client = createPhoenixTradingClient(params.builderAuthority);
  const side = params.side === "buy" ? Side.Bid : Side.Ask;

  const packet = await client.orderPackets.buildMarketOrderPacket({
    symbol: params.symbol,
    side,
    baseUnits: params.baseUnits,
  });

  const ix = await client.ixs.placeMarketOrder({
    authority: params.traderAuthority,
    symbol: params.symbol,
    orderPacket: packet,
  });

  return {
    instruction: ix,
    isFlightRouted: ix.programAddress === flight.FLIGHT_PROGRAM_ADDRESS,
  };
}

export async function registerFlightBuilder(params: {
  builderAuthority: string;
  feeBps?: bigint;
}) {
  const feeBps = params.feeBps ?? BigInt(5);
  return flight.buildRegisterBuilderIx({
    traderAuthority: params.builderAuthority,
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    feeBps,
  });
}
