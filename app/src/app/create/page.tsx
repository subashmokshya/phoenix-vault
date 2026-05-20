"use client";

import { useState } from "react";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STRATEGIES = [
  "Momentum",
  "Market Neutral",
  "Volatility",
  "Macro",
  "HFT",
  "Arbitrage",
];

export default function CreatePoolPage() {
  const { connected, address, connect, requireWallet } = useSolanaWallet();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState(STRATEGIES[0]);
  const [perfFee, setPerfFee] = useState(20);
  const [mgmtFee, setMgmtFee] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!requireWallet() || !address) {
      connect();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: `Vault${Date.now()}`,
          manager: address,
          name,
          description,
          strategyTag: strategy,
          perfFeeBps: perfFee * 100,
          mgmtFeeBps: mgmtFee * 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create pool");
        return;
      }
      alert("Pool metadata saved. Complete on-chain init_vault via your wallet.");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        Launch a Pool
      </h1>
      <p className="text-muted mb-8">
        Create a vault, register on Phoenix, and start accepting deposits.
      </p>

      <Card className="space-y-6">
        {connected && address && (
          <p className="text-sm text-muted">
            Manager wallet:{" "}
            <span className="font-mono text-foreground">{address}</span>
          </p>
        )}
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">
            Pool Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-2 h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/50"
            placeholder="Alpha Momentum"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full mt-2 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="Describe your strategy…"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">
            Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full mt-2 h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none"
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted uppercase tracking-wider">
              Performance Fee (%)
            </label>
            <input
              type="number"
              value={perfFee}
              onChange={(e) => setPerfFee(Number(e.target.value))}
              min={0}
              max={50}
              className="w-full mt-2 h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wider">
              Management Fee (%)
            </label>
            <input
              type="number"
              value={mgmtFee}
              onChange={(e) => setMgmtFee(Number(e.target.value))}
              min={0}
              max={10}
              step={0.1}
              className="w-full mt-2 h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          onClick={handleCreate}
          disabled={submitting || !name}
        >
          {connected ? "Create Pool" : "Connect Wallet"}
        </Button>
        <p className="text-xs text-muted text-center">
          Step 1: Save metadata · Step 2: Sign init_vault on-chain · Step 3:
          Register Phoenix account
        </p>
      </Card>
    </div>
  );
}
