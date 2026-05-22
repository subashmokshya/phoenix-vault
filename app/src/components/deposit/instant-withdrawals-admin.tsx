"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldOff,
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
import {
  sendApproveRelayer,
  sendRevokeRelayer,
} from "@/lib/spl/approve";
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

type Action =
  | { phase: "idle" }
  | { phase: "signing"; mode: "approve" | "revoke" }
  | { phase: "saving"; mode: "approve" | "revoke" }
  | { phase: "done"; mode: "approve" | "revoke"; signature: string; explorerUrl: string }
  | { phase: "error"; message: string };

export function InstantWithdrawalsAdmin({
  poolAddress,
  managerAddress,
  isManager,
  relayerAuthorized,
  onAuthorizationChange,
}: Props) {
  const [info, setInfo] = useState<RelayerInfo | null>(null);
  const [history, setHistory] = useState<CompletedWithdrawal[]>([]);
  const [action, setAction] = useState<Action>({ phase: "idle" });
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
        if (active) setInfo({ configured: false, error: "Failed to fetch relayer info" });
      });
    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/withdrawals/history/${poolAddress}`,
        { cache: "no-store" }
      );
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

  async function authorize() {
    if (!managerPubkey || !signAndSendTransaction) return;
    if (!info?.configured || !info.publicKey) {
      setAction({
        phase: "error",
        message: "Relayer is not configured on the server.",
      });
      return;
    }
    setAction({ phase: "signing", mode: "approve" });
    try {
      const relayerPk = new PublicKey(info.publicKey);
      const result = await sendApproveRelayer({
        manager: managerPubkey,
        relayer: relayerPk,
        poolAddress,
        signAndSend: signAndSendTransaction,
      });
      setAction({ phase: "saving", mode: "approve" });
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
        throw new Error(err.error ?? "Failed to record authorization");
      }
      setAction({
        phase: "done",
        mode: "approve",
        signature: result.signature,
        explorerUrl: result.explorerUrl,
      });
      onAuthorizationChange?.(true);
    } catch (e) {
      setAction({
        phase: "error",
        message:
          e instanceof Error ? e.message : "Authorization failed unexpectedly",
      });
    }
  }

  async function revoke() {
    if (!managerPubkey || !signAndSendTransaction) return;
    setAction({ phase: "signing", mode: "revoke" });
    try {
      const result = await sendRevokeRelayer({
        manager: managerPubkey,
        poolAddress,
        signAndSend: signAndSendTransaction,
      });
      setAction({ phase: "saving", mode: "revoke" });
      const res = await fetch("/api/relayer/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poolAddress,
          authorized: false,
          cluster: result.cluster === "unknown" ? cluster : result.cluster,
          signature: result.signature,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to record revocation");
      }
      setAction({
        phase: "done",
        mode: "revoke",
        signature: result.signature,
        explorerUrl: result.explorerUrl,
      });
      onAuthorizationChange?.(false);
    } catch (e) {
      setAction({
        phase: "error",
        message:
          e instanceof Error ? e.message : "Revocation failed unexpectedly",
      });
    }
  }

  const busy =
    action.phase === "signing" || action.phase === "saving";

  return (
    <Card className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Instant withdrawals</h3>
          {relayerAuthorized ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-positive/15 text-positive">
              <ShieldCheck className="h-3 w-3" />
              enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              <ShieldOff className="h-3 w-3" />
              disabled
            </span>
          )}
        </div>
      </header>

      <div className="text-[11px] text-muted leading-relaxed space-y-1 border border-border/60 rounded-xl p-3 bg-surface-2/40">
        <p className="text-foreground inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-accent" />
          <span className="font-semibold">
            How it works
          </span>
        </p>
        <p>
          Users withdraw instantly without your approval. You sign a one-time
          SPL token <span className="font-mono">approve</span> granting a
          platform-controlled refund relayer permission to spend USDC from
          your token account on behalf of depositors.
        </p>
        <p>
          The server enforces a hard cap per user — it can only refund up to
          their tracked deposit balance. You can revoke the delegation any
          time with one click.
        </p>
        {info?.configured && info.publicKey ? (
          <p className="text-[11px]">
            Relayer:{" "}
            <span className="font-mono">{shortAddress(info.publicKey, 6)}</span>
          </p>
        ) : (
          <p className="text-negative">
            {info?.error ??
              "Relayer not yet configured on the server — instant withdrawals are unavailable."}
          </p>
        )}
      </div>

      {isManager && info?.configured ? (
        <div className="flex gap-2">
          {!relayerAuthorized ? (
            <Button
              className="flex-1"
              size="sm"
              disabled={busy}
              onClick={() => void authorize()}
            >
              {action.phase === "signing" && action.mode === "approve" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sign in wallet…
                </>
              ) : action.phase === "saving" && action.mode === "approve" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Recording…
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Enable instant withdrawals
                </>
              )}
            </Button>
          ) : (
            <Button
              className="flex-1"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {action.phase === "signing" && action.mode === "revoke" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sign revoke…
                </>
              ) : action.phase === "saving" && action.mode === "revoke" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Recording…
                </>
              ) : (
                <>
                  <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                  Revoke authorization
                </>
              )}
            </Button>
          )}
        </div>
      ) : !isManager ? (
        <p className="text-[11px] text-muted">
          Connect with the manager wallet to authorize or revoke instant
          withdrawals.
        </p>
      ) : null}

      {action.phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs flex items-center justify-between rounded-xl bg-positive/10 text-positive border border-positive/40 px-3 py-2"
        >
          <span>
            {action.mode === "approve"
              ? "Instant withdrawals are live."
              : "Authorization revoked."}
          </span>
          <a
            href={action.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline inline-flex items-center gap-1"
          >
            {action.signature.slice(0, 8)}…
            <ExternalLink className="h-3 w-3" />
          </a>
        </motion.div>
      )}

      {action.phase === "error" && (
        <p className="text-xs text-negative">{action.message}</p>
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
