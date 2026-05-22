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
  /** Manager has SPL-approved the platform relayer to refund users on their behalf. */
  relayerAuthorized?: boolean;
  /** Solana cluster the manager authorized on (mainnet/devnet). */
  relayerCluster?: "mainnet" | "devnet" | "testnet";
  /** Tx signature of the approve instruction. */
  relayerAuthorizeSignature?: string;
};

export type LedgerDeposit = {
  signature: string;
  poolAddress: string;
  depositor: string;
  amountUsdc: number;
  ts: number;
  cluster: "mainnet" | "devnet" | "testnet";
};

export type LedgerWithdrawal = {
  signature: string;
  poolAddress: string;
  depositor: string;
  amountUsdc: number;
  ts: number;
  cluster: "mainnet" | "devnet" | "testnet";
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

// ------------------------- Ledger -------------------------

const DEPOSIT_KEY = (sig: string) => `deposit:${sig}`;
const WITHDRAW_KEY = (sig: string) => `withdraw:${sig}`;
const POOL_DEPOSIT_SET = (pool: string) => `pool:${pool}:deposits`;
const POOL_WITHDRAW_SET = (pool: string) => `pool:${pool}:withdrawals`;
const USER_POOL_DEPOSIT_SET = (user: string, pool: string) =>
  `user:${user}:pool:${pool}:deposits`;
const USER_POOL_WITHDRAW_SET = (user: string, pool: string) =>
  `user:${user}:pool:${pool}:withdrawals`;

export async function recordDeposit(entry: LedgerDeposit): Promise<void> {
  const redis = getRegistry();
  if (!redis) throw new Error("Registry is not configured");

  const existing = await redis.get<LedgerDeposit>(DEPOSIT_KEY(entry.signature));
  if (existing) return;

  const pipe = redis.pipeline();
  pipe.set(DEPOSIT_KEY(entry.signature), entry);
  pipe.sadd(POOL_DEPOSIT_SET(entry.poolAddress), entry.signature);
  pipe.sadd(
    USER_POOL_DEPOSIT_SET(entry.depositor, entry.poolAddress),
    entry.signature
  );
  await pipe.exec();
}

export async function recordWithdrawal(entry: LedgerWithdrawal): Promise<void> {
  const redis = getRegistry();
  if (!redis) throw new Error("Registry is not configured");

  const existing = await redis.get<LedgerWithdrawal>(
    WITHDRAW_KEY(entry.signature)
  );
  if (existing) return;

  const pipe = redis.pipeline();
  pipe.set(WITHDRAW_KEY(entry.signature), entry);
  pipe.sadd(POOL_WITHDRAW_SET(entry.poolAddress), entry.signature);
  pipe.sadd(
    USER_POOL_WITHDRAW_SET(entry.depositor, entry.poolAddress),
    entry.signature
  );
  await pipe.exec();
}

async function sumLedger<T extends { amountUsdc: number }>(
  redis: Redis,
  setKey: string,
  itemKey: (sig: string) => string
): Promise<{ total: number; entries: T[] }> {
  const sigs = await redis.smembers(setKey);
  if (!sigs.length) return { total: 0, entries: [] };
  const keys = sigs.map(itemKey);
  const rows = (await redis.mget<T[]>(...keys)) ?? [];
  const entries = rows.filter((r): r is T => Boolean(r));
  const total = entries.reduce((s, e) => s + Number(e.amountUsdc), 0);
  return { total, entries };
}

export async function getNetPosition(
  depositor: string,
  poolAddress: string
): Promise<{
  deposited: number;
  withdrawn: number;
  net: number;
  deposits: LedgerDeposit[];
  withdrawals: LedgerWithdrawal[];
}> {
  const redis = getRegistry();
  if (!redis) {
    return { deposited: 0, withdrawn: 0, net: 0, deposits: [], withdrawals: [] };
  }
  const [deposits, withdrawals] = await Promise.all([
    sumLedger<LedgerDeposit>(
      redis,
      USER_POOL_DEPOSIT_SET(depositor, poolAddress),
      DEPOSIT_KEY
    ),
    sumLedger<LedgerWithdrawal>(
      redis,
      USER_POOL_WITHDRAW_SET(depositor, poolAddress),
      WITHDRAW_KEY
    ),
  ]);
  return {
    deposited: deposits.total,
    withdrawn: withdrawals.total,
    net: Math.max(0, deposits.total - withdrawals.total),
    deposits: deposits.entries,
    withdrawals: withdrawals.entries,
  };
}

export async function getPoolWithdrawals(
  poolAddress: string,
  limit = 50
): Promise<LedgerWithdrawal[]> {
  const redis = getRegistry();
  if (!redis) return [];
  const sigs = await redis.smembers(POOL_WITHDRAW_SET(poolAddress));
  if (!sigs.length) return [];
  const keys = sigs.map(WITHDRAW_KEY);
  const rows = (await redis.mget<LedgerWithdrawal[]>(...keys)) ?? [];
  return rows
    .filter((r): r is LedgerWithdrawal => Boolean(r))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

export type PoolAggregates = {
  totalDeposited: number;
  totalWithdrawn: number;
  netAum: number;
  depositorCount: number;
  lastDepositTs: number | null;
};

/**
 * Compute live aggregates for a pool by scanning the ledger sets.
 * Cheap for the deposit volumes we expect (single-digit thousands of sigs)
 * and avoids needing a write side-channel on every deposit/withdrawal.
 */
export async function getPoolAggregates(
  poolAddress: string
): Promise<PoolAggregates> {
  const redis = getRegistry();
  if (!redis) {
    return {
      totalDeposited: 0,
      totalWithdrawn: 0,
      netAum: 0,
      depositorCount: 0,
      lastDepositTs: null,
    };
  }

  const [depositSigs, withdrawSigs] = await Promise.all([
    redis.smembers(POOL_DEPOSIT_SET(poolAddress)),
    redis.smembers(POOL_WITHDRAW_SET(poolAddress)),
  ]);

  const depositRows: LedgerDeposit[] = depositSigs.length
    ? (
        (await redis.mget<LedgerDeposit[]>(
          ...depositSigs.map(DEPOSIT_KEY)
        )) ?? []
      ).filter((r): r is LedgerDeposit => Boolean(r))
    : [];

  const withdrawRows: LedgerWithdrawal[] = withdrawSigs.length
    ? (
        (await redis.mget<LedgerWithdrawal[]>(
          ...withdrawSigs.map(WITHDRAW_KEY)
        )) ?? []
      ).filter((r): r is LedgerWithdrawal => Boolean(r))
    : [];

  let totalDeposited = 0;
  let lastDepositTs: number | null = null;
  const perUser = new Map<string, number>();
  for (const d of depositRows) {
    totalDeposited += Number(d.amountUsdc);
    if (lastDepositTs === null || d.ts > lastDepositTs) lastDepositTs = d.ts;
    perUser.set(d.depositor, (perUser.get(d.depositor) ?? 0) + Number(d.amountUsdc));
  }
  let totalWithdrawn = 0;
  for (const w of withdrawRows) {
    totalWithdrawn += Number(w.amountUsdc);
    perUser.set(
      w.depositor,
      (perUser.get(w.depositor) ?? 0) - Number(w.amountUsdc)
    );
  }

  let depositorCount = 0;
  perUser.forEach((v) => {
    if (v > 0.0000001) depositorCount += 1;
  });

  return {
    totalDeposited,
    totalWithdrawn,
    netAum: Math.max(0, totalDeposited - totalWithdrawn),
    depositorCount,
    lastDepositTs,
  };
}

export async function setRelayerAuthorization(
  poolAddress: string,
  data: {
    authorized: boolean;
    cluster?: "mainnet" | "devnet" | "testnet";
    signature?: string;
  }
): Promise<RegistryPool | null> {
  const redis = getRegistry();
  if (!redis) throw new Error("Registry is not configured");
  const pool = await redis.get<RegistryPool>(POOL_KEY(poolAddress));
  if (!pool) return null;
  const updated: RegistryPool = {
    ...pool,
    relayerAuthorized: data.authorized,
    relayerCluster: data.cluster ?? pool.relayerCluster,
    relayerAuthorizeSignature: data.signature ?? pool.relayerAuthorizeSignature,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(POOL_KEY(poolAddress), updated);
  return updated;
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
    relayerAuthorized: p.relayerAuthorized,
  };
}
