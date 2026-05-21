import "server-only";
import { Redis } from "@upstash/redis";
import type { PoolCard } from "@/lib/mock-data";

/**
 * Lightweight Upstash-Redis-backed pool registry.
 *
 * Why: Phoenix Vault needs a globally-readable record of every pool a manager
 * launches so depositors on any device can discover them. We don't yet need
 * Postgres-level querying for this surface; Upstash gives us serverless KV
 * with zero infra at the Vercel edge.
 *
 * Key shape:
 *   pool:<address>             → JSON `RegistryPool`
 *   pools:index                → SET of all pool addresses
 *   pools:manager:<manager>    → SET of pool addresses for that manager
 */

export type RegistryPool = {
  address: string;
  manager: string;
  name: string;
  description: string;
  strategyTag: string;
  perfFeeBps: number;
  mgmtFeeBps: number;
  phoenixAuthority?: string;
  vaultIndex: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function getCredentials(): { url: string; token: string } | null {
  // Prefer explicit Upstash naming, fall back to Vercel KV integration vars.
  const url =
    readEnv("UPSTASH_REDIS_REST_URL") ?? readEnv("KV_REST_API_URL") ?? null;
  const token =
    readEnv("UPSTASH_REDIS_REST_TOKEN") ??
    readEnv("KV_REST_API_TOKEN") ??
    null;
  if (!url || !token) return null;
  return { url, token };
}

let cached: Redis | null = null;

export function getRegistry(): Redis | null {
  if (cached) return cached;
  const creds = getCredentials();
  if (!creds) return null;
  cached = new Redis({ url: creds.url, token: creds.token });
  return cached;
}

export function isRegistryConfigured(): boolean {
  return getCredentials() !== null;
}

const POOL_KEY = (address: string) => `pool:${address}`;
const INDEX_KEY = "pools:index";
const MANAGER_KEY = (manager: string) => `pools:manager:${manager}`;

export async function upsertPool(input: {
  address: string;
  manager: string;
  name: string;
  description?: string;
  strategyTag: string;
  perfFeeBps: number;
  mgmtFeeBps: number;
  phoenixAuthority?: string;
  vaultIndex?: number;
}): Promise<RegistryPool> {
  const redis = getRegistry();
  if (!redis) throw new Error("Registry is not configured");

  const existing = await redis.get<RegistryPool>(POOL_KEY(input.address));
  const now = new Date().toISOString();
  const pool: RegistryPool = {
    address: input.address,
    manager: input.manager,
    name: input.name,
    description: input.description ?? existing?.description ?? "",
    strategyTag: input.strategyTag,
    perfFeeBps: input.perfFeeBps,
    mgmtFeeBps: input.mgmtFeeBps,
    phoenixAuthority: input.phoenixAuthority ?? existing?.phoenixAuthority,
    vaultIndex: input.vaultIndex ?? existing?.vaultIndex ?? 0,
    featured: existing?.featured ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // Run writes in a pipeline for atomicity-as-best-effort.
  const pipe = redis.pipeline();
  pipe.set(POOL_KEY(pool.address), pool);
  pipe.sadd(INDEX_KEY, pool.address);
  pipe.sadd(MANAGER_KEY(pool.manager), pool.address);
  await pipe.exec();

  return pool;
}

export async function getPoolFromRegistry(
  address: string
): Promise<RegistryPool | null> {
  const redis = getRegistry();
  if (!redis) return null;
  const pool = await redis.get<RegistryPool>(POOL_KEY(address));
  return pool ?? null;
}

export async function listPoolsFromRegistry(opts?: {
  manager?: string;
  strategy?: string;
  featured?: boolean;
  limit?: number;
}): Promise<RegistryPool[]> {
  const redis = getRegistry();
  if (!redis) return [];

  const addresses = opts?.manager
    ? await redis.smembers(MANAGER_KEY(opts.manager))
    : await redis.smembers(INDEX_KEY);
  if (!addresses.length) return [];

  const keys = addresses.map(POOL_KEY);
  const rows = (await redis.mget<RegistryPool[]>(...keys)) ?? [];
  let pools = rows.filter((p): p is RegistryPool => Boolean(p));

  if (opts?.strategy) {
    pools = pools.filter((p) => p.strategyTag === opts.strategy);
  }
  if (opts?.featured) {
    pools = pools.filter((p) => p.featured);
  }
  pools.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (opts?.limit) pools = pools.slice(0, opts.limit);
  return pools;
}

export function poolToCard(p: RegistryPool): PoolCard {
  return {
    address: p.address,
    name: p.name,
    manager: p.manager,
    managerName: `${p.manager.slice(0, 4)}…${p.manager.slice(-4)}`,
    strategyTag: p.strategyTag,
    description: p.description,
    aum: 0,
    pnl7d: 0,
    pnl30d: 0,
    perfFeeBps: p.perfFeeBps,
    mgmtFeeBps: p.mgmtFeeBps,
    featured: p.featured,
    depositorCount: 0,
    sharePrice: 1,
    navHistory: [],
    phoenixAuthority: p.phoenixAuthority,
  };
}
