import type { Transaction } from "@solana/web3.js";

export type SolanaWalletName = "Phantom" | "Solflare";

export interface SolanaWalletAdapter {
  name: SolanaWalletName;
  icon: string;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
  isInstalled: () => boolean;
}
