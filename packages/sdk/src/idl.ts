export const PHOENIX_VAULT_PROGRAM_ID = "PhxVau1t1111111111111111111111111111111111";

export const VAULT_SEED = "vault";
export const VAULT_AUTHORITY_SEED = "vault_authority";
export const VAULT_USDC_SEED = "vault_usdc";
export const DEPOSITOR_SEED = "depositor";
export const WITHDRAW_SEED = "withdraw";

export const PLATFORM_FLIGHT_FEE_BPS = 5;
export const DEFAULT_PLATFORM_PERF_SPLIT_BPS = 2000;

export type VaultAccount = {
  manager: string;
  authority: string;
  usdcVault: string;
  name: number[];
  strategyTag: number;
  perfFeeBps: number;
  mgmtFeeBps: number;
  platformFeeBps: number;
  depositCap: bigint;
  totalShares: bigint;
  navLamports: bigint;
  highWaterMark: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  paused: boolean;
  hasOpenPositions: boolean;
  phoenixRegistered: boolean;
  portfolioIndex: number;
  bump: number;
  authorityBump: number;
  createdAt: bigint;
  lastNavUpdate: bigint;
};
