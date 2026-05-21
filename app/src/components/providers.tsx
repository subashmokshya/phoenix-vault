"use client";

import { WalletProvider } from "@/lib/wallet/context";
import { WalletModal } from "./wallet-modal";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {children}
      <WalletModal />
    </WalletProvider>
  );
}
