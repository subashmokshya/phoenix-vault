import type { Transaction } from "@solana/web3.js";
import type { SolanaWalletAdapter } from "./types";

type Provider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage: (
    message: Uint8Array,
    display?: string
  ) => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction?: (
    tx: Transaction
  ) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  publicKey?: { toString: () => string } | null;
};

function getPhantom(): Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { phantom?: { solana?: Provider } };
  return w.phantom?.solana;
}

function getSolflare(): Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { solflare?: Provider };
  return w.solflare;
}

function adapterFromProvider(
  name: SolanaWalletAdapter["name"],
  icon: string,
  getProvider: () => Provider | undefined
): SolanaWalletAdapter {
  return {
    name,
    icon,
    isInstalled: () => Boolean(getProvider()),
    connect: async () => {
      const provider = getProvider();
      if (!provider) throw new Error(`${name} wallet not installed`);
      const res = await provider.connect();
      return res.publicKey.toString();
    },
    disconnect: async () => {
      const provider = getProvider();
      if (provider) await provider.disconnect();
    },
    signMessage: async (message) => {
      const provider = getProvider();
      if (!provider) throw new Error(`${name} wallet not connected`);
      const res = await provider.signMessage(message, "utf8");
      return res.signature;
    },
    signAndSendTransaction: async (tx) => {
      const provider = getProvider();
      if (!provider) throw new Error(`${name} wallet not connected`);
      if (typeof provider.signAndSendTransaction === "function") {
        return provider.signAndSendTransaction(tx);
      }
      throw new Error(`${name} does not support signAndSendTransaction`);
    },
  };
}

export const PHANTOM = adapterFromProvider(
  "Phantom",
  "https://phantom.app/img/logo.png",
  getPhantom
);

export const SOLFLARE = adapterFromProvider(
  "Solflare",
  "https://solflare.com/favicon.ico",
  getSolflare
);

export const AVAILABLE_WALLETS = [PHANTOM, SOLFLARE];
