"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet/context";
import {
  clusterFromRpc,
  type ClusterKind,
} from "@/lib/spl/usdc";
import { sendApproveRelayer } from "@/lib/spl/approve";
import { primaryRpcUrl } from "@/lib/wallet/rpc";
import { cn, formatUsd, shortAddress } from "@/lib/utils";

type Props = {
  poolAddress: string;
  managerAddress: string;
  isManager: boolean;
  relayerAuthorized: boolean | undefined;
  onAuthorizationChange?: (next: boolean) => void;
};

type RelayerInfo = {
  configured: boolean;
  publicKey?: string;
  error?: string;
};

type CompletedWithdrawal = {
  signature: string;
  poolAddress: string;
  depositor: string;
  amountUsdc: number;
  ts: number;
  cluster: string;
};

type SetupState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "saving" }
  | { phase: "done"; signature: string; explorerUrl: string }
  | { phase: "error"; message: string };

/**
 * For new pools the SPL approve is bundled into the launch tx, so this panel
 * only ever surfaces the "enabled" status and the recent-withdrawals log.
 * For legacy pools that launched before bundling existed, it offers a one-tap
 * setup that signs the missing approve and back-fills the registry flag.
 */
export function InstantWithdrawalsAdmin({
  poolAddress,
  managerAddress,
  isManager,
  relayerAuthorized,
  onAuthorizationChange,
}: Props) {
  const [info, setInfo] = useState<RelayerInfo | null>(null);
  const [history, setHistory] = useState<CompletedWithdrawal[]>([]);
  const [setup, setSetup] = useState<SetupState>({ phase: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);

  const { signAndSendTransaction } = useWallet();
  const rpcUrl = primaryRpcUrl();
  const cluster: ClusterKind = clusterFromRpc(rpcUrl);

  const managerPubkey = useMemo(() => {
    try {
      return new PublicKey(managerAddress);
    } catch {
      return null;
    }
  }, [managerAddress]);

  useEffect(() => {
    let active = true;
    fetch("/api/relayer/info", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active) setInfo(d as RelayerInfo);
      })
      .catch(() => {
        if (active)
          setInfo({ configured: false, error: "Failed to fetch relayer info" });
      });
    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/withdrawals/history/${poolAddress}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { withdrawals?: CompletedWithdrawal[] };
      setHistory(data.withdrawals ?? []);
    } catch {
      // ignore
    }
  }, [poolAddress]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setRefreshKey((k) => k + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  async function completeSetup() {
    if (!managerPubkey || !signAndSendTransaction) return;
    if (!info?.configured || !info.publicKey) {
      setSetup({
        phase: "error",
        message: "Refund relayer is not configured on the server.",
      });
      return;
    }
    setSetup({ phase: "signing" });
    try {
      const relayerPk = new PublicKey(info.publicKey);
      const result = await sendApproveRelayer({
        manager: managerPubkey,
        relayer: relayerPk,
        poolAddress,
        signAndSend: signAndSendTransaction,
      });
      setSetup({ phase: "saving" });
      const res = await fetch("/api/relayer/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poolAddress,
          authorized: true,
          cluster: result.cluster === "unknown" ? cluster : result.cluster,
          signature: result.signature,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to record setup");
      }
      setSetup({
        phase: "done",
        signature: result.signature,
        explorerUrl: result.explorerUrl,
      });
      onAuthorizationChange?.(true);
    } catch (e) {
      setSetup({
        phase: "error",
        message: e instanceof Error ? e.message : "Setup failed unexpectedly",
      });
    }
  }

  const busy = setup.phase === "signing" || setup.phase === "saving";
  const showLegacySetup =
    isManager && !relayerAuthorized && info?.configured && !!info.publicKey;

  return (
    <Card className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Withdrawals</h3>
          {relayerAuthorized ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-positive/15 text-positive">
              <ShieldCheck className="h-3 w-3" />
              instant
            </span>
          ) : info?.configured ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              setup pending
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-border/40 text-muted">
              relayer offline
            </span>
          )}
        </div>
      </header>

      <p className="text-[11px] text-muted leading-relaxed">
        Depositors withdraw instantly up to the liquid USDC balance in the
        manager&apos;s wallet — funds locked in open Phoenix orders are
        excluded automatically. The refund relayer can only return money that
        was previously deposited; everything else stays with you for trading.
      </p>

      {showLegacySetup && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 text-accent p-3 space-y-2 text-[11px]">
          <p>
            This pool was launched before instant withdrawals were bundled
            into the launch transaction. One-time signature finishes setup.
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => void completeSetup()}
          >
            {setup.phase === "signing" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sign in wallet…
              </>
            ) : setup.phase === "saving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Recording…
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Finish setup
              </>
            )}
          </Button>
        </div>
      )}

      {setup.phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs flex items-center justify-between rounded-xl bg-positive/10 text-positive border border-positive/40 px-3 py-2"
        >
          <span>Instant withdrawals are live.</span>
          <a
            href={setup.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline inline-flex items-center gap-1"
          >
            {setup.signature.slice(0, 8)}…
            <ExternalLink className="h-3 w-3" />
          </a>
        </motion.div>
      )}

      {setup.phase === "error" && (
        <p className="text-xs text-negative">{setup.message}</p>
      )}

      {history.length > 0 && (
        <div className="border-t border-border/60 pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Recent withdrawals
          </p>
          <ul className="space-y-1.5">
            {history.slice(0, 8).map((w) => (
              <li
                key={w.signature}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-muted">
                  {shortAddress(w.depositor, 4)}
                </span>
                <span className="tabular-nums">{formatUsd(w.amountUsdc)}</span>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                    "bg-positive/15 text-positive"
                  )}
                >
                  paid
                </span>
                <a
                  href={`https://explorer.solana.com/tx/${w.signature}${
                    w.cluster && w.cluster !== "mainnet"
                      ? `?cluster=${w.cluster}`
                      : ""
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-accent"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
