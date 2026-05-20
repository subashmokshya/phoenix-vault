"use client";

import dynamic from "next/dynamic";
import { WalletModal } from "./wallet-modal";

const WalletProvider = dynamic(
  () => import("@/lib/wallet/context").then((m) => m.WalletProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {children}
      <WalletModal />
    </WalletProvider>
  );
}
