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
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
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
  connection: Connection | null;
  publicKey: PublicKey | null;
  address: string | null;
  connected: boolean;
  connecting: boolean;
  wallet: SolanaWalletAdapter | null;
  connect: (adapter?: SolanaWalletAdapter) => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  signAndSendTransaction:
    | ((tx: Transaction) => Promise<{ signature: string }>)
    | null;
  openModal: () => void;
  closeModal: () => void;
  modalOpen: boolean;
  wallets: SolanaWalletAdapter[];
  ready: boolean;
  cluster: "mainnet" | "devnet" | "testnet" | "unknown";
};

const noop = async () => {};

const defaultValue: WalletContextValue = {
  connection: null,
  publicKey: null,
  address: null,
  connected: false,
  connecting: false,
  wallet: null,
  connect: noop,
  disconnect: noop,
  signMessage: null,
  signAndSendTransaction: null,
  openModal: () => {},
  closeModal: () => {},
  modalOpen: false,
  wallets: AVAILABLE_WALLETS,
  ready: false,
  cluster: "unknown",
};

const WalletContext = createContext<WalletContextValue>(defaultValue);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [wallet, setWallet] = useState<SolanaWalletAdapter | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const connection = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return new Connection(RPC, "confirmed");
    } catch {
      return null;
    }
  }, []);

  const address = publicKey?.toBase58() ?? null;
  const connected = Boolean(publicKey);

  const authenticate = useCallback(
    async (adapter: SolanaWalletAdapter, pubkey: string) => {
      try {
        await signInWithWallet({
          publicKey: pubkey,
          signMessage: (msg) => adapter.signMessage(msg),
        });
      } catch (e) {
        console.warn("SIWS authentication failed:", e);
      }
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
        return;
      }

      setConnecting(true);
      try {
        const pubkey = await target.connect();
        const pk = new PublicKey(pubkey);
        setPublicKey(pk);
        setWallet(target);
        setModalOpen(false);
        await authenticate(target, pubkey);
      } catch (e) {
        console.warn("Wallet connect failed:", e);
      } finally {
        setConnecting(false);
      }
    },
    [authenticate]
  );

  const disconnect = useCallback(async () => {
    try {
      if (wallet) await wallet.disconnect();
    } catch {
      // ignore
    }
    try {
      await signOutWallet();
    } catch {
      // ignore
    }
    setPublicKey(null);
    setWallet(null);
  }, [wallet]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;

    type PhantomGlobal = {
      phantom?: {
        solana?: {
          publicKey?: { toString: () => string } | null;
          isConnected?: boolean;
        };
      };
    };
    const phantom = (window as Window & PhantomGlobal).phantom?.solana;

    if (phantom?.isConnected && phantom.publicKey) {
      try {
        const pubkey = phantom.publicKey.toString();
        setPublicKey(new PublicKey(pubkey));
        setWallet(PHANTOM);
        fetchSession()
          .then((session) => {
            if (session !== pubkey) {
              authenticate(PHANTOM, pubkey).catch(() => {});
            }
          })
          .catch(() => {});
      } catch {
        // ignore
      }
    }
  }, [mounted, authenticate]);

  const signMessage = wallet
    ? (message: Uint8Array) => wallet.signMessage(message)
    : null;

  const signAndSendTransaction = wallet
    ? (tx: Transaction) => wallet.signAndSendTransaction(tx)
    : null;

  const cluster: "mainnet" | "devnet" | "testnet" | "unknown" = (() => {
    const url = connection?.rpcEndpoint ?? RPC;
    if (url.includes("devnet")) return "devnet";
    if (url.includes("testnet")) return "testnet";
    if (url.includes("mainnet") || url.includes("api.mainnet"))
      return "mainnet";
    return "unknown";
  })();

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
    signAndSendTransaction,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
    modalOpen,
    wallets: AVAILABLE_WALLETS,
    ready: mounted,
    cluster,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
