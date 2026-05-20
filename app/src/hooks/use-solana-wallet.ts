"use client";

import { useCallback } from "react";
import { useWallet } from "@/lib/wallet/context";

export function useSolanaWallet() {
  const {
    address,
    connected,
    connecting,
    disconnect,
    openModal,
    signMessage,
    wallet,
  } = useWallet();

  const requireWallet = useCallback(() => {
    if (!connected) {
      openModal();
      return false;
    }
    return true;
  }, [connected, openModal]);

  return {
    address,
    connected,
    connecting,
    connect: openModal,
    disconnect,
    requireWallet,
    signMessage,
    walletName: wallet?.name ?? null,
    canSign: Boolean(signMessage),
  };
}
