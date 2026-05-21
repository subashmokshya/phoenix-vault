"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet/context";
import { Button } from "./ui/button";

export function WalletButton() {
  const { connected, address, connecting, openModal, disconnect, ready } =
    useWallet();

  if (!ready) {
    return (
      <Button size="sm" variant="secondary" disabled>
        Connect Wallet
      </Button>
    );
  }

  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/portfolio"
          className="hidden sm:block text-sm text-muted hover:text-foreground font-mono tabular-nums"
        >
          {address.slice(0, 4)}…{address.slice(-4)}
        </Link>
        <Button variant="ghost" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={openModal} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect Wallet"}
    </Button>
  );
}
