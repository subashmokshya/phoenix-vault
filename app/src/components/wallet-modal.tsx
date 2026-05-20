"use client";

import { useWallet } from "@/lib/wallet/context";
import { cn } from "@/lib/utils";

export function WalletModal() {
  const { modalOpen, closeModal, connect, connecting, wallets } = useWallet();

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Connect Wallet</h2>
        <p className="text-sm text-muted mb-6">
          Choose a Solana wallet to continue
        </p>
        <div className="space-y-2">
          {wallets.map((w) => {
            const installed = w.isInstalled();
            return (
              <button
                key={w.name}
                type="button"
                disabled={connecting || !installed}
                onClick={() => connect(w).catch(() => {})}
                className={cn(
                  "w-full flex items-center gap-3 h-12 px-4 rounded-xl border transition-colors",
                  installed
                    ? "border-border hover:border-accent hover:bg-surface-2"
                    : "border-border opacity-50 cursor-not-allowed"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" className="h-6 w-6 rounded" />
                <span className="font-medium">{w.name}</span>
                {!installed && (
                  <span className="ml-auto text-xs text-muted">Not installed</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted text-center mt-4">
          New to Solana?{" "}
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Get Phantom
          </a>
        </p>
      </div>
    </div>
  );
}
