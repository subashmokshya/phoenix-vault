export type SolanaWalletName = "Phantom" | "Solflare";

export interface SolanaWalletAdapter {
  name: SolanaWalletName;
  icon: string;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  isInstalled: () => boolean;
}
