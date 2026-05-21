"use client";

export type DepositEntry = {
  id: string;
  poolAddress: string;
  depositor: string;
  amount: number;
  signature: string;
  ts: number;
  explorerUrl: string;
};

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

export type WithdrawalRequest = {
  id: string;
  poolAddress: string;
  depositor: string;
  depositorAta: string;
  amount: number;
  ts: number;
  status: WithdrawalStatus;
  managerSignature?: string;
  managerSignatureUrl?: string;
  resolvedAt?: number;
  note?: string;
};

const DEPOSITS_KEY = "phoenix-vault.deposits";
const WITHDRAWALS_KEY = "phoenix-vault.withdrawals";

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value.slice(0, 500)));
  } catch {
    // ignore
  }
}

// -------- Deposits --------

export function appendDeposit(entry: DepositEntry): void {
  const all = readArray<DepositEntry>(DEPOSITS_KEY);
  writeArray<DepositEntry>(DEPOSITS_KEY, [entry, ...all]);
}

export function listDeposits(filter?: {
  poolAddress?: string;
  depositor?: string;
}): DepositEntry[] {
  const all = readArray<DepositEntry>(DEPOSITS_KEY);
  return all.filter(
    (d) =>
      (!filter?.poolAddress || d.poolAddress === filter.poolAddress) &&
      (!filter?.depositor || d.depositor === filter.depositor)
  );
}

export function totalDepositedBy(
  depositor: string,
  poolAddress?: string
): number {
  return listDeposits({ depositor, poolAddress }).reduce(
    (s, d) => s + d.amount,
    0
  );
}

// -------- Withdrawals --------

export function appendWithdrawal(req: WithdrawalRequest): void {
  const all = readArray<WithdrawalRequest>(WITHDRAWALS_KEY);
  writeArray<WithdrawalRequest>(WITHDRAWALS_KEY, [req, ...all]);
}

export function updateWithdrawal(
  id: string,
  patch: Partial<WithdrawalRequest>
): WithdrawalRequest | null {
  const all = readArray<WithdrawalRequest>(WITHDRAWALS_KEY);
  let updated: WithdrawalRequest | null = null;
  const next = all.map((w) => {
    if (w.id !== id) return w;
    updated = { ...w, ...patch };
    return updated;
  });
  writeArray<WithdrawalRequest>(WITHDRAWALS_KEY, next);
  return updated;
}

export function listWithdrawals(filter?: {
  poolAddress?: string;
  depositor?: string;
  status?: WithdrawalStatus;
}): WithdrawalRequest[] {
  const all = readArray<WithdrawalRequest>(WITHDRAWALS_KEY);
  return all.filter(
    (w) =>
      (!filter?.poolAddress || w.poolAddress === filter.poolAddress) &&
      (!filter?.depositor || w.depositor === filter.depositor) &&
      (!filter?.status || w.status === filter.status)
  );
}

export function netPositionFor(
  depositor: string,
  poolAddress?: string
): number {
  const deposits = listDeposits({ depositor, poolAddress }).reduce(
    (s, d) => s + d.amount,
    0
  );
  const paid = listWithdrawals({
    depositor,
    poolAddress,
    status: "paid",
  }).reduce((s, w) => s + w.amount, 0);
  return deposits - paid;
}
