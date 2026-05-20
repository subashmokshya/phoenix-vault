"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  fetchSession,
  signInWithWallet,
  signOutWallet,
} from "@/lib/siws-client";
import { AVAILABLE_WALLETS, PHANTOM } from "./adapters";
import type { SolanaWalletAdapter } from "./types";

const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("mainnet-beta");

type WalletContextValue = {
  connection: Connection;
  publicKey: PublicKey | null;
  address: string | null;
  connected: boolean;
  connecting: boolean;
  wallet: SolanaWalletAdapter | null;
  connect: (adapter?: SolanaWalletAdapter) => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  openModal: () => void;
  closeModal: () => void;
  modalOpen: boolean;
  wallets: SolanaWalletAdapter[];
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [wallet, setWallet] = useState<SolanaWalletAdapter | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const connection = useMemo(() => new Connection(RPC, "confirmed"), []);

  const address = publicKey?.toBase58() ?? null;
  const connected = Boolean(publicKey);

  const authenticate = useCallback(
    async (adapter: SolanaWalletAdapter, pubkey: string) => {
      await signInWithWallet({
        publicKey: pubkey,
        signMessage: (msg) => adapter.signMessage(msg),
      });
    },
    []
  );

  const connect = useCallback(
    async (adapter?: SolanaWalletAdapter) => {
      const target =
        adapter ??
        AVAILABLE_WALLETS.find((w) => w.isInstalled()) ??
        PHANTOM;

      if (!target.isInstalled()) {
        setModalOpen(true);
        throw new Error(`${target.name} is not installed`);
      }

      setConnecting(true);
      try {
        const pubkey = await target.connect();
        const pk = new PublicKey(pubkey);
        setPublicKey(pk);
        setWallet(target);
        setModalOpen(false);
        await authenticate(target, pubkey);
      } finally {
        setConnecting(false);
      }
    },
    [authenticate]
  );

  const disconnect = useCallback(async () => {
    if (wallet) await wallet.disconnect().catch(() => {});
    await signOutWallet();
    setPublicKey(null);
    setWallet(null);
  }, [wallet]);

  // Auto-reconnect Phantom if previously connected
  useEffect(() => {
    const phantom = (window as Window & { phantom?: { solana?: { publicKey?: { toString: () => string }; isConnected?: boolean } } }).phantom?.solana;
    if (phantom?.isConnected && phantom.publicKey) {
      const pubkey = phantom.publicKey.toString();
      setPublicKey(new PublicKey(pubkey));
      setWallet(PHANTOM);
      fetchSession().then((session) => {
        if (session !== pubkey) {
          authenticate(PHANTOM, pubkey).catch(() => {});
        }
      });
    }
  }, [authenticate]);

  const signMessage = wallet
    ? (message: Uint8Array) => wallet.signMessage(message)
    : null;

  const value: WalletContextValue = {
    connection,
    publicKey,
    address,
    connected,
    connecting,
    wallet,
    connect,
    disconnect,
    signMessage,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
    modalOpen,
    wallets: AVAILABLE_WALLETS,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
