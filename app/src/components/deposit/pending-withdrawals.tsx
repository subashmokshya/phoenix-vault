"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ExternalLink,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { useWallet } from "@/lib/wallet/context";
import {
  listWithdrawals,
  updateWithdrawal,
  type WithdrawalRequest,
} from "@/lib/deposits/store";
import {
  clusterFromRpc,
  sendUsdcTransfer,
} from "@/lib/spl/usdc";
import { primaryRpcUrl } from "@/lib/wallet/rpc";
import { cn, formatUsd, shortAddress } from "@/lib/utils";

type Props = {
  poolAddress: string;
  isManager: boolean;
};

type ProcessingMap = Record<string, "signing" | "confirming" | undefined>;

export function PendingWithdrawals({ poolAddress, isManager }: Props) {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [processing, setProcessing] = useState<ProcessingMap>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { connected } = useSolanaWallet();
  const { signAndSendTransaction, address } = useWallet();

  const rpcUrl = primaryRpcUrl();
  const cluster = clusterFromRpc(rpcUrl);

  useEffect(() => {
    const all = listWithdrawals({ poolAddress });
    setItems(all);
  }, [poolAddress, refreshKey]);

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const pending = items.filter((i) => i.status === "pending");
  const settled = items.filter((i) => i.status !== "pending");

  async function approve(req: WithdrawalRequest) {
    if (!isManager || !address || !signAndSendTransaction) return;
    setError(null);
    setProcessing((p) => ({ ...p, [req.id]: "signing" }));
    let fromPubkey: PublicKey;
    let toPubkey: PublicKey;
    try {
      fromPubkey = new PublicKey(address);
    } catch {
      setError("Your wallet address looks invalid. Reconnect and retry.");
      setProcessing((p) => {
        const n = { ...p };
        delete n[req.id];
        return n;
      });
      return;
    }
    try {
      toPubkey = new PublicKey(req.depositor);
    } catch {
      setError(
        `Recorded depositor "${shortAddress(req.depositor, 4)}" is not a valid Solana address; rejecting this request.`
      );
      reject(req, "Invalid depositor address");
      setProcessing((p) => {
        const n = { ...p };
        delete n[req.id];
        return n;
      });
      return;
    }
    try {
      const result = await sendUsdcTransfer({
        from: fromPubkey,
        to: toPubkey,
        amountUi: req.amount,
        cluster,
        signAndSend: signAndSendTransaction,
        memo: {
          app: "phoenix-vault",
          v: 1,
          action: "withdraw",
          pool: poolAddress,
          amountUsdc: req.amount,
          requestId: req.id,
        },
      });
      updateWithdrawal(req.id, {
        status: "paid",
        managerSignature: result.signature,
        managerSignatureUrl: result.explorerUrl,
        resolvedAt: Date.now(),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send USDC");
    } finally {
      setProcessing((p) => {
        const next = { ...p };
        delete next[req.id];
        return next;
      });
    }
  }

  function reject(req: WithdrawalRequest, note = "Rejected by manager") {
    updateWithdrawal(req.id, {
      status: "rejected",
      resolvedAt: Date.now(),
      note,
    });
    setRefreshKey((k) => k + 1);
  }

  if (items.length === 0) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Withdrawals</h3>
        </div>
        <p className="text-xs text-muted">
          No withdrawal requests yet. Depositors can request withdrawals from
          the pool page.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Withdrawals</h3>
          {pending.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent">
              {pending.length} pending
            </span>
          )}
        </div>
        {isManager && (
          <span className="flex items-center gap-1 text-[11px] text-positive">
            <ShieldCheck className="h-3 w-3" />
            manager controls
          </span>
        )}
      </header>

      {error && (
        <p className="text-xs text-negative">{error}</p>
      )}

      {pending.length > 0 && (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {pending.map((req) => {
              const state = processing[req.id];
              return (
                <motion.li
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="rounded-xl border border-border bg-surface-2/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold tabular-nums">
                        {formatUsd(req.amount)}
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        to {shortAddress(req.depositor, 6)} ·{" "}
                        {new Date(req.ts).toLocaleString()}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                        "bg-accent/15 text-accent"
                      )}
                    >
                      pending
                    </span>
                  </div>
                  {isManager ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => approve(req)}
                        disabled={!!state || !connected}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        {state === "signing"
                          ? "Sign in wallet…"
                          : "Approve & send USDC"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => reject(req)}
                        disabled={!!state}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted">
                      Awaiting manager approval.
                    </p>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {settled.length > 0 && (
        <div className="pt-2 border-t border-border/60 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Recent
          </p>
          <ul className="space-y-1">
            {settled.slice(0, 6).map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-muted">
                  {shortAddress(req.depositor, 4)}
                </span>
                <span className="tabular-nums">{formatUsd(req.amount)}</span>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                    req.status === "paid"
                      ? "bg-positive/15 text-positive"
                      : req.status === "rejected"
                        ? "bg-negative/15 text-negative"
                        : "bg-accent/15 text-accent"
                  )}
                >
                  {req.status}
                </span>
                {req.managerSignatureUrl && (
                  <a
                    href={req.managerSignatureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
