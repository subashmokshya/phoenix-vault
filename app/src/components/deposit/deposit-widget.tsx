"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { useWallet } from "@/lib/wallet/context";
import {
  clusterFromRpc,
  getUsdcBalance,
  sendUsdcTransfer,
  type ClusterKind,
} from "@/lib/spl/usdc";
import {
  appendDeposit,
  appendWithdrawal,
  listDeposits,
} from "@/lib/deposits/store";
import { cn, formatUsd } from "@/lib/utils";
import { primaryRpcUrl } from "@/lib/wallet/rpc";

type Mode = "deposit" | "withdraw";

type Props = {
  poolAddress: string;
  poolName?: string;
  managerAddress: string;
  relayerAuthorized?: boolean;
};

type Status =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "signing" }
  | { phase: "confirming" }
  | { phase: "done"; signature: string; explorerUrl: string }
  | { phase: "withdrawn"; signature: string; explorerUrl: string; amount: number }
  | { phase: "error"; message: string };

export function DepositWidget({
  poolAddress,
  managerAddress,
  relayerAuthorized,
}: Props) {
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [serverPosition, setServerPosition] = useState<number | null>(null);
  const [poolLiquidity, setPoolLiquidity] = useState<number | null>(null);

  const { connected, address, connect, requireWallet } = useSolanaWallet();
  const { signAndSendTransaction } = useWallet();

  const rpcUrl = primaryRpcUrl();
  const cluster: ClusterKind = clusterFromRpc(rpcUrl);
  const networkLabel = cluster === "mainnet" ? "Mainnet" : cluster;

  const managerPubkey = useMemo(() => {
    if (!managerAddress) return null;
    try {
      return new PublicKey(managerAddress);
    } catch {
      return null;
    }
  }, [managerAddress]);
  const managerIsLive = managerPubkey !== null;

  const myDeposits = address
    ? listDeposits({ depositor: address, poolAddress })
    : [];
  const myDeposited =
    serverPosition !== null
      ? serverPosition
      : myDeposits.reduce((sum, d) => sum + d.amount, 0);

  const refreshPosition = useCallback(async () => {
    if (!address) {
      setServerPosition(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/positions/${poolAddress}?depositor=${address}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { net?: number };
      if (typeof data.net === "number") setServerPosition(data.net);
    } catch {
      // keep local fallback
    }
  }, [address, poolAddress]);

  const refreshLiquidity = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/pools/${poolAddress}/liquidity?cluster=${cluster}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { liquidityUsdc?: number };
      if (typeof data.liquidityUsdc === "number")
        setPoolLiquidity(data.liquidityUsdc);
    } catch {
      // ignore — UI will fall back to position-only caps
    }
  }, [poolAddress, cluster]);

  useEffect(() => {
    refreshPosition();
    refreshLiquidity();
  }, [refreshPosition, refreshLiquidity, refreshKey]);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    try {
      const { Connection } = await import("@solana/web3.js");
      const conn = new Connection(rpcUrl, "confirmed");
      const res = await getUsdcBalance(conn, new PublicKey(address), cluster);
      setBalance(res.uiAmount);
    } catch (e) {
      console.warn("USDC balance load failed", e);
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [address, rpcUrl, cluster]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance, refreshKey]);

  const numericAmount = Number(amount);
  const validAmount =
    Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : 0;
  const withdrawableCap = useMemo(() => {
    if (poolLiquidity === null) return myDeposited;
    return Math.min(myDeposited, poolLiquidity);
  }, [myDeposited, poolLiquidity]);
  const overBalance =
    mode === "deposit" && balance !== null && validAmount > balance;
  const overPosition =
    mode === "withdraw" && validAmount > withdrawableCap + 1e-6;

  async function handleDeposit() {
    if (!requireWallet() || !address || !signAndSendTransaction) return;
    if (validAmount <= 0) {
      setStatus({ phase: "error", message: "Enter a USDC amount" });
      return;
    }
    if (!managerPubkey) {
      setStatus({
        phase: "error",
        message:
          "This pool is a demo seed and has no live manager wallet — deposits are disabled. Launch your own pool to try the real flow.",
      });
      return;
    }
    let fromPubkey: PublicKey;
    try {
      fromPubkey = new PublicKey(address);
    } catch {
      setStatus({
        phase: "error",
        message: "Your connected wallet address looks invalid. Reconnect and retry.",
      });
      return;
    }
    setStatus({ phase: "preparing" });
    try {
      setStatus({ phase: "signing" });
      const result = await sendUsdcTransfer({
        from: fromPubkey,
        to: managerPubkey,
        amountUi: validAmount,
        cluster,
        signAndSend: signAndSendTransaction,
        memo: {
          app: "phoenix-vault",
          v: 1,
          action: "deposit",
          pool: poolAddress,
          amountUsdc: validAmount,
        },
      });
      appendDeposit({
        id: `${result.signature}`,
        poolAddress,
        depositor: address,
        amount: validAmount,
        signature: result.signature,
        ts: Date.now(),
        explorerUrl: result.explorerUrl,
      });
      setStatus({
        phase: "done",
        signature: result.signature,
        explorerUrl: result.explorerUrl,
      });
      setAmount("");
      // Mirror the deposit to the server-side ledger so instant withdrawals
      // know about the position. Best-effort; the server re-verifies on-chain.
      void fetch("/api/deposits/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poolAddress,
          depositor: address,
          signature: result.signature,
          cluster,
        }),
      })
        .catch(() => {
          // best-effort; user can retry from /portfolio
        })
        .finally(() => setRefreshKey((k) => k + 1));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to send USDC transfer";
      setStatus({ phase: "error", message });
    }
  }

  async function handleInstantWithdraw() {
    if (!requireWallet() || !address) return;
    if (validAmount <= 0) {
      setStatus({ phase: "error", message: "Enter a USDC amount" });
      return;
    }
    if (validAmount > myDeposited + 1e-6) {
      setStatus({
        phase: "error",
        message: `You can withdraw up to ${myDeposited.toFixed(2)} USDC based on your verified deposits`,
      });
      return;
    }
    if (poolLiquidity !== null && validAmount > poolLiquidity + 1e-6) {
      setStatus({
        phase: "error",
        message: `Only ${poolLiquidity.toFixed(2)} USDC is currently liquid in the pool; the rest is in open Phoenix positions. Try a smaller amount or wait for trades to settle.`,
      });
      return;
    }
    setStatus({ phase: "preparing" });
    try {
      const res = await fetch("/api/withdrawals/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poolAddress,
          amountUsdc: validAmount,
          cluster,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signature?: string;
        explorerUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.signature) {
        setStatus({
          phase: "error",
          message:
            data.error ?? "Withdrawal failed. Please try again in a moment.",
        });
        return;
      }
      // Mirror to local ledger for UX continuity, but server is now authoritative.
      appendWithdrawal({
        id: data.signature,
        poolAddress,
        depositor: address,
        depositorAta: "",
        amount: validAmount,
        ts: Date.now(),
        status: "paid",
        managerSignature: data.signature,
        managerSignatureUrl: data.explorerUrl,
        resolvedAt: Date.now(),
      });
      setStatus({
        phase: "withdrawn",
        signature: data.signature,
        explorerUrl: data.explorerUrl ?? "",
        amount: validAmount,
      });
      setAmount("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setStatus({
        phase: "error",
        message:
          e instanceof Error ? e.message : "Withdrawal failed unexpectedly",
      });
    }
  }

  function submit() {
    if (mode === "deposit") handleDeposit();
    else void handleInstantWithdraw();
  }

  const busy =
    status.phase === "preparing" ||
    status.phase === "signing" ||
    status.phase === "confirming";

  return (
    <Card className="space-y-4">
      <div className="flex rounded-full bg-surface-2 p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setStatus({ phase: "idle" });
            }}
            className={cn(
              "flex-1 py-2 rounded-full text-sm font-medium capitalize transition-colors flex items-center justify-center gap-1.5",
              mode === m ? "bg-accent text-white" : "text-muted"
            )}
          >
            {m === "deposit" ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted uppercase tracking-wider">
            Amount (USDC)
          </label>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[11px] text-muted hover:text-foreground flex items-center gap-1"
            title="Refresh USDC balance"
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                balanceLoading && "animate-spin"
              )}
            />
            {connected
              ? balance === null
                ? "balance —"
                : `balance ${balance.toFixed(2)}`
              : "connect"}
          </button>
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (status.phase === "error") setStatus({ phase: "idle" });
          }}
          placeholder="0.00"
          className={cn(
            "w-full h-12 px-4 rounded-xl bg-surface-2 border text-xl font-semibold tabular-nums focus:outline-none focus:ring-2",
            overBalance || overPosition
              ? "border-negative focus:ring-negative/40"
              : "border-border focus:ring-accent/50"
          )}
        />
        <div className="flex flex-wrap gap-2 pt-2">
          {[25, 50, 75, 100].map((pct) => {
            const cap = mode === "deposit" ? balance ?? 0 : withdrawableCap;
            const value = (cap * pct) / 100;
            const enabled = cap > 0;
            return (
              <button
                key={pct}
                type="button"
                disabled={!enabled}
                onClick={() => setAmount(value.toFixed(2))}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-full border",
                  enabled
                    ? "border-border text-muted hover:text-foreground hover:border-border-hover"
                    : "border-border/50 text-muted/40 cursor-not-allowed"
                )}
              >
                {pct}%
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[11px] text-muted leading-relaxed space-y-1 border border-border/60 rounded-xl p-3 bg-surface-2/40">
        <div className="flex items-center gap-1.5 text-foreground">
          <Wallet className="h-3 w-3" />
          <span className="font-semibold">
            Real USDC transfer · {networkLabel}
          </span>
        </div>
        <p>
          Deposits land in the manager&apos;s USDC account so they can route
          Phoenix orders. Withdraw anytime — you&apos;ll receive your share
          of the liquid USDC balance directly to your wallet, capped at your
          deposit.
        </p>
        {relayerAuthorized === false && (
          <div className="flex items-start gap-1.5 text-accent">
            <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
            <p>
              This pool launched before instant withdrawals were automatic.
              The manager needs to complete a one-time setup before refunds
              can be routed.
            </p>
          </div>
        )}
        {relayerAuthorized !== false && (
          <div className="flex items-start gap-1.5 text-positive">
            <Zap className="h-3 w-3 mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">Instant withdrawals.</span>{" "}
              Refunds clear in seconds against the liquid pool balance — no
              approval steps. Funds locked in open Phoenix trades become
              withdrawable as positions settle.
            </p>
          </div>
        )}
      </div>

      {!managerIsLive && (
        <div className="text-[11px] rounded-xl border border-accent/40 bg-accent/10 text-accent px-3 py-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">Demo pool · deposits disabled</div>
            <p className="text-accent/90 leading-relaxed">
              This vault uses a seeded manager placeholder, not a real Solana
              wallet, so real USDC can&apos;t be routed to it. Launch your own
              pool on{" "}
              <Link href="/create" className="underline hover:no-underline">
                /create
              </Link>{" "}
              to try the live deposit + trading flow with your wallet as
              manager.
            </p>
          </div>
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={
          busy ||
          !validAmount ||
          overBalance ||
          overPosition ||
          (mode === "deposit" && !managerIsLive)
        }
        onClick={() => (connected ? submit() : connect())}
      >
        {!connected
          ? "Connect Wallet"
          : busy
            ? status.phase === "signing"
              ? "Awaiting signature…"
              : status.phase === "preparing"
                ? mode === "withdraw"
                  ? "Routing refund…"
                  : "Preparing tx…"
                : "Confirming on Solana…"
            : mode === "deposit"
              ? `Deposit ${validAmount ? validAmount.toFixed(2) : ""} USDC`
              : `Withdraw ${validAmount ? validAmount.toFixed(2) : ""} USDC instantly`}
      </Button>

      {status.phase === "error" && (
        <p className="text-xs text-negative flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {status.message}
        </p>
      )}

      {status.phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs flex items-center justify-between rounded-xl bg-positive/10 text-positive border border-positive/40 px-3 py-2"
        >
          <span>Deposit confirmed</span>
          <a
            href={status.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline inline-flex items-center gap-1"
          >
            {status.signature.slice(0, 8)}…
            <ExternalLink className="h-3 w-3" />
          </a>
        </motion.div>
      )}

      {status.phase === "withdrawn" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs flex items-center justify-between rounded-xl bg-positive/10 text-positive border border-positive/40 px-3 py-2"
        >
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            Withdrew {formatUsd(status.amount)}
          </span>
          {status.explorerUrl && (
            <a
              href={status.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:underline inline-flex items-center gap-1"
            >
              {status.signature.slice(0, 8)}…
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </motion.div>
      )}

      {(address && myDeposited > 0) || poolLiquidity !== null ? (
        <div className="border-t border-border/60 pt-3 mt-2 space-y-2 text-xs">
          {address && myDeposited > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted">Your position</span>
              <span className="font-semibold tabular-nums">
                {formatUsd(myDeposited)}
              </span>
            </div>
          )}
          {poolLiquidity !== null && (
            <div className="flex items-center justify-between">
              <span className="text-muted">Pool liquid balance</span>
              <span className="tabular-nums">{formatUsd(poolLiquidity)}</span>
            </div>
          )}
          {address &&
            mode === "withdraw" &&
            myDeposited > 0 &&
            poolLiquidity !== null && (
              <div className="flex items-center justify-between text-positive">
                <span>Available to withdraw now</span>
                <span className="font-semibold tabular-nums">
                  {formatUsd(withdrawableCap)}
                </span>
              </div>
            )}
          {myDeposits.length > 0 && (
            <Link
              href="/portfolio"
              className="text-accent hover:underline text-[11px]"
            >
              View deposit history →
            </Link>
          )}
        </div>
      ) : null}
    </Card>
  );
}
