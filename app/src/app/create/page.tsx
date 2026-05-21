"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, ExternalLink, Wallet, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiStrategyPanel } from "@/components/ai/ai-strategy-panel";
import { useSolanaWallet } from "@/hooks/use-solana-wallet";
import { useWallet } from "@/lib/wallet/context";
import {
  buildAndSendLaunchTx,
  type LaunchResult,
} from "@/lib/wallet/launch-tx";
import {
  DEFAULT_DRAFT,
  STRATEGY_TAGS,
  type PoolDraft,
  type StrategyTag,
} from "@/lib/ai/strategy-tools";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";

type LaunchState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "saving"; result: LaunchResult }
  | { phase: "done"; result: LaunchResult; poolAddress: string }
  | { phase: "error"; message: string };

function createMockVaultAddress(manager: string): string {
  return `Vault${manager.slice(0, 16)}${Date.now()}`.padEnd(44, "1");
}

export default function CreatePoolPage() {
  const [draft, setDraft] = useState<PoolDraft>(DEFAULT_DRAFT);
  const [launch, setLaunch] = useState<LaunchState>({ phase: "idle" });

  const { connected, address, requireWallet } = useSolanaWallet();
  const { signAndSendTransaction, cluster } = useWallet();

  const canLaunch =
    connected &&
    draft.name.trim().length > 0 &&
    draft.strategyTag.length > 0;

  async function launchPool() {
    if (!requireWallet() || !address || !signAndSendTransaction) {
      return;
    }

    setLaunch({ phase: "signing" });

    try {
      const result = await buildAndSendLaunchTx({
        payer: new PublicKey(address),
        signAndSend: signAndSendTransaction,
        payload: {
          app: "phoenix-vault",
          v: 1,
          name: draft.name,
          strategyTag: draft.strategyTag,
          perfFeeBps: Math.round(draft.perfFeePct * 100),
          mgmtFeeBps: Math.round(draft.mgmtFeePct * 100),
          ts: Math.floor(Date.now() / 1000),
        },
      });

      setLaunch({ phase: "saving", result });

      const poolAddress = createMockVaultAddress(address);

      const res = await fetch("/api/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: poolAddress,
          manager: address,
          name: draft.name,
          description: draft.description,
          strategyTag: draft.strategyTag,
          perfFeeBps: Math.round(draft.perfFeePct * 100),
          mgmtFeeBps: Math.round(draft.mgmtFeePct * 100),
          phoenixAuthority: address,
        }),
      });

      // Even if backend save fails (e.g., no DB), the on-chain launch succeeded.
      if (!res.ok) {
        console.warn("Metadata save failed, but on-chain launch succeeded.");
      }

      setLaunch({ phase: "done", result, poolAddress });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to launch pool on-chain";
      setLaunch({ phase: "error", message });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Launch on Phoenix
        </h1>
        <p className="text-muted mt-1">
          Design your strategy with AI, then deploy your pool directly to Solana.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 min-h-[700px]">
        <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-9rem)]">
          <AiStrategyPanel draft={draft} onDraftChange={setDraft} />
        </div>

        <div className="space-y-6">
          <ConfigForm
            draft={draft}
            onChange={setDraft}
            manager={address}
            connected={connected}
            cluster={cluster}
          />

          <LaunchPanel
            canLaunch={canLaunch}
            connected={connected}
            launch={launch}
            onLaunch={launchPool}
            onReset={() => {
              setLaunch({ phase: "idle" });
              setDraft(DEFAULT_DRAFT);
            }}
            cluster={cluster}
          />
        </div>
      </div>
    </div>
  );
}

function ConfigForm({
  draft,
  onChange,
  manager,
  connected,
  cluster,
}: {
  draft: PoolDraft;
  onChange: (d: PoolDraft) => void;
  manager: string | null;
  connected: boolean;
  cluster: "mainnet" | "devnet" | "testnet" | "unknown";
}) {
  const update = <K extends keyof PoolDraft>(key: K, value: PoolDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pool Configuration</h3>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider px-2 py-1 rounded-full",
            cluster === "mainnet"
              ? "bg-positive/15 text-positive"
              : "bg-accent/15 text-accent"
          )}
        >
          {cluster}
        </span>
      </div>

      {connected && manager && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Wallet className="h-3.5 w-3.5" />
          <span>Manager</span>
          <span className="font-mono text-foreground tabular-nums">
            {manager.slice(0, 6)}…{manager.slice(-6)}
          </span>
        </div>
      )}

      <Field label="Pool Name">
        <input
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Solar Momentum"
          maxLength={32}
          className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </Field>

      <Field label="Short Description">
        <textarea
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          placeholder="A 1-sentence pitch shown to depositors…"
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
        />
      </Field>

      <Field label="Strategy Tag">
        <div className="grid grid-cols-3 gap-2">
          {STRATEGY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => update("strategyTag", tag as StrategyTag)}
              className={cn(
                "text-xs font-medium h-9 rounded-full border transition-colors",
                draft.strategyTag === tag
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-muted hover:border-border-hover"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Performance Fee (${draft.perfFeePct}%)`}>
          <input
            type="range"
            min={0}
            max={50}
            value={draft.perfFeePct}
            onChange={(e) => update("perfFeePct", Number(e.target.value))}
            className="w-full accent-accent"
          />
        </Field>
        <Field label={`Management Fee (${draft.mgmtFeePct}%)`}>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={draft.mgmtFeePct}
            onChange={(e) => update("mgmtFeePct", Number(e.target.value))}
            className="w-full accent-accent"
          />
        </Field>
      </div>

      <Field label="Strategy Playbook">
        <textarea
          value={draft.playbook}
          onChange={(e) => update("playbook", e.target.value)}
          rows={8}
          placeholder="Markets · Entry rules · Exit rules · Position sizing · Risk management…"
          className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none font-mono text-xs leading-relaxed"
        />
        <p className="text-[11px] text-muted mt-1">
          Tip: ask PhoenixGPT to write the playbook for you.
        </p>
      </Field>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wider block mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function LaunchPanel({
  canLaunch,
  connected,
  launch,
  onLaunch,
  onReset,
  cluster,
}: {
  canLaunch: boolean;
  connected: boolean;
  launch: LaunchState;
  onLaunch: () => void;
  onReset: () => void;
  cluster: "mainnet" | "devnet" | "testnet" | "unknown";
}) {
  if (launch.phase === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="space-y-4 border-accent/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent/15 text-accent flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Pool launched on Solana</h3>
              <p className="text-xs text-muted">
                Your launch is permanently recorded on-chain.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <Row
              label="Signature"
              value={
                <a
                  href={launch.result.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent hover:underline inline-flex items-center gap-1"
                >
                  {launch.result.signature.slice(0, 8)}…
                  {launch.result.signature.slice(-8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
            />
            <Row
              label="Pool"
              value={
                <Link
                  href={`/pool/${launch.poolAddress}`}
                  className="font-mono text-accent hover:underline"
                >
                  View pool →
                </Link>
              }
            />
            <Row
              label="Cluster"
              value={<span className="uppercase">{cluster}</span>}
            />
          </div>

          <div className="flex gap-2">
            <Link href={`/pool/${launch.poolAddress}`} className="flex-1">
              <Button className="w-full">Open pool</Button>
            </Link>
            <Button variant="secondary" onClick={onReset}>
              Launch another
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  const busy =
    launch.phase === "signing" ||
    launch.phase === "confirming" ||
    launch.phase === "saving";

  const label = (() => {
    if (!connected) return "Connect wallet to launch";
    if (launch.phase === "signing") return "Awaiting wallet signature…";
    if (launch.phase === "confirming") return "Confirming on Solana…";
    if (launch.phase === "saving") return "Saving pool metadata…";
    return "Launch on Phoenix";
  })();

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-accent" />
        <h3 className="font-semibold">Deploy on-chain</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">
        Your wallet will sign a Solana transaction recording this pool&apos;s
        configuration. After confirmation, your pool appears in the marketplace.
      </p>

      <Button
        size="lg"
        className="w-full"
        disabled={!canLaunch || busy}
        onClick={onLaunch}
      >
        {label}
      </Button>

      {launch.phase === "error" && (
        <p className="text-xs text-negative">{launch.message}</p>
      )}

      <p className="text-[11px] text-muted text-center">
        Step 1: AI designs strategy · Step 2: Wallet signs launch tx · Step 3:
        Pool goes live
      </p>
    </Card>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
