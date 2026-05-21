import { Connection, type Commitment } from "@solana/web3.js";

const DEVNET_FALLBACKS = [
  "https://api.devnet.solana.com",
  "https://devnet.helius-rpc.com/?api-key=demo",
];

const MAINNET_FALLBACKS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];

function clusterFor(url: string): "devnet" | "testnet" | "mainnet" {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  return "mainnet";
}

export function getRpcUrls(): string[] {
  const env = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (env && env.trim().length > 0) {
    const explicit = env.split(",").map((u) => u.trim()).filter(Boolean);
    const cluster = clusterFor(explicit[0] ?? "");
    const fallbacks =
      cluster === "devnet" ? DEVNET_FALLBACKS : MAINNET_FALLBACKS;
    return Array.from(new Set([...explicit, ...fallbacks]));
  }
  return DEVNET_FALLBACKS;
}

export function primaryRpcUrl(): string {
  return getRpcUrls()[0]!;
}

export function newConnection(commitment: Commitment = "confirmed"): Connection {
  return new Connection(primaryRpcUrl(), commitment);
}

export async function getLatestBlockhashWithFallback(
  urls: string[],
  commitment: Commitment = "confirmed"
): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
  rpcUrl: string;
}> {
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const conn = new Connection(url, commitment);
      const res = await conn.getLatestBlockhash(commitment);
      return {
        blockhash: res.blockhash,
        lastValidBlockHeight: res.lastValidBlockHeight,
        rpcUrl: url,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `All RPC endpoints failed (last: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    })`
  );
}
