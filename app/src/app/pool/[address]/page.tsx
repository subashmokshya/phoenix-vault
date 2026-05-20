"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PnlChart } from "@/components/charts/pnl-chart";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPoolByAddress } from "@/lib/mock-data";
import { formatBps, cn } from "@/lib/utils";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";

const RANGES = ["1d", "7d", "30d", "all"] as const;

export default function PoolDetailPage() {
  const params = useParams();
  const poolAddress = params.address as string;
  const pool = getPoolByAddress(poolAddress);
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [navHistory, setNavHistory] = useState(pool?.navHistory ?? []);
  const [depositAmount, setDepositAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const { connected, address: walletAddress, connect, requireWallet } =
    useSolanaWallet();

  async function handleVaultAction() {
    if (!requireWallet()) return;
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      setTxStatus("Enter a valid USDC amount");
      return;
    }
    setTxStatus(
      mode === "deposit"
        ? `Ready to deposit ${amount} USDC from ${walletAddress?.slice(0, 4)}… — sign init_vault deposit tx on-chain when program is deployed.`
        : `Withdrawal request queued for ${amount} USDC — processed after cooldown when vault is flat.`
    );
  }

  useEffect(() => {
    if (!pool) return;
    fetch(`/api/pools/${poolAddress}/nav?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.history?.length) setNavHistory(d.history);
      })
      .catch(() => {});
  }, [poolAddress, range, pool]);

  if (!pool) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-4">Pool not found</h1>
        <Link href="/explore" className="text-accent hover:underline">
          Back to Explore
        </Link>
      </div>
    );
  }

  const positive = pool.pnl7d >= 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <div className="mb-6">
            <span className="text-xs px-2 py-1 rounded-full bg-surface-3 text-muted">
              {pool.strategyTag}
            </span>
            <h1 className="text-3xl font-semibold tracking-tight mt-3">
              {pool.name}
            </h1>
            <p className="text-muted mt-1">
              by{" "}
              <Link
                href={`/managers/${pool.manager}`}
                className="text-accent hover:underline"
              >
                {pool.managerName}
              </Link>
            </p>
            <p className="text-muted mt-4 leading-relaxed max-w-2xl">
              {pool.description}
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium uppercase",
                  range === r
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <Card className="mb-8 p-4">
            <PnlChart data={navHistory} positive={positive} />
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Stat label="AUM" value={pool.aum} suffix="$" />
            <Stat label="7D PnL" value={pool.pnl7d} suffix="%" change={pool.pnl7d} />
            <Stat label="30D PnL" value={pool.pnl30d} suffix="%" change={pool.pnl30d} />
            <Stat label="Share Price" value={pool.sharePrice.toFixed(3)} />
          </div>

          <Card>
            <h3 className="font-semibold mb-4">Fee Structure</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">Performance Fee</p>
                <p className="font-medium">{formatBps(pool.perfFeeBps)}</p>
              </div>
              <div>
                <p className="text-muted">Management Fee</p>
                <p className="font-medium">{formatBps(pool.mgmtFeeBps)}</p>
              </div>
              <div>
                <p className="text-muted">Depositors</p>
                <p className="font-medium">{pool.depositorCount}</p>
              </div>
              <div>
                <p className="text-muted">Platform Split</p>
                <p className="font-medium">20% of perf fee</p>
              </div>
            </div>
          </Card>
        </div>

        <aside className="w-full lg:w-80 shrink-0">
          <Card className="sticky top-24">
            <div className="flex rounded-full bg-surface-2 p-1 mb-4">
              {(["deposit", "withdraw"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-2 rounded-full text-sm font-medium capitalize transition-colors",
                    mode === m ? "bg-accent text-white" : "text-muted"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted uppercase tracking-wider">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className="w-full mt-2 h-12 px-4 rounded-xl bg-surface-2 border border-border text-xl font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-muted mt-2 mb-4">
              Deposits only execute when the vault has zero open positions
              (manager-flat window).
            </p>
            <Button className="w-full" size="lg" onClick={handleVaultAction}>
              {!connected
                ? "Connect Wallet"
                : mode === "deposit"
                  ? "Deposit"
                  : "Request Withdraw"}
            </Button>
            {txStatus && (
              <p className="text-xs text-muted text-center mt-3">{txStatus}</p>
            )}
            {!connected && !txStatus && (
              <p className="text-xs text-muted text-center mt-3">
                <button
                  type="button"
                  onClick={connect}
                  className="text-accent hover:underline"
                >
                  Connect Solana wallet
                </button>{" "}
                to continue
              </p>
            )}
            {connected && walletAddress && !txStatus && (
              <p className="text-xs text-muted text-center mt-3 font-mono">
                {walletAddress.slice(0, 4)}…{walletAddress.slice(-4)}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
