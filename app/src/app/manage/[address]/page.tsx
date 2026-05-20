"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPoolByAddress } from "@/lib/mock-data";
import Link from "next/link";

export default function ManagePoolPage() {
  const params = useParams();
  const address = params.address as string;
  const pool = getPoolByAddress(address);
  const { authenticated, login } = usePrivy();
  const [symbol, setSymbol] = useState("SOL-PERP");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("0.1");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [paused, setPaused] = useState(false);

  if (!pool) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <p>Pool not found</p>
        <Link href="/explore" className="text-accent">
          Explore
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Manage · {pool.name}
          </h1>
          <p className="text-muted mt-1">Manager dashboard</p>
        </div>
        <Button
          variant={paused ? "primary" : "danger"}
          size="sm"
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume Vault" : "Pause Vault"}
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold">Place Order (Phoenix + Flight)</h3>
          <div className="flex gap-2">
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`px-4 py-2 rounded-full text-sm capitalize ${
                  orderType === t
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Symbol e.g. SOL-PERP"
            className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border"
          />
          <div className="flex gap-2">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`flex-1 py-2 rounded-full text-sm font-medium capitalize ${
                  side === s
                    ? s === "buy"
                      ? "bg-positive/20 text-positive"
                      : "bg-negative/20 text-negative"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Size (base units)"
            className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border"
          />
          <Button
            className="w-full"
            onClick={() => (authenticated ? alert("Build tx via Rise SDK + Flight") : login())}
          >
            {authenticated ? `Place ${orderType} ${side}` : "Connect Wallet"}
          </Button>
          <p className="text-xs text-muted">
            Orders route through Phoenix Flight (5 bps builder fee to platform).
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-3">Positions</h3>
            <p className="text-sm text-muted">No open positions</p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Depositors</h3>
            <p className="text-2xl font-semibold tabular-nums">
              {pool.depositorCount}
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="space-y-2">
              <Button variant="secondary" className="w-full" size="sm">
                Set Flat (allow deposits)
              </Button>
              <Button variant="secondary" className="w-full" size="sm">
                Harvest Fees
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
