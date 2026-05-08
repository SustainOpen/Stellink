/**
 * Global wallet context. The provider lives in App.tsx; components consume
 * the wallet via `useWallet()`.
 */
import React, { createContext, useContext } from "react";
import { useStellarWallet, type StellarWallet } from "@/hooks/useStellarWallet";

const WalletCtx = createContext<StellarWallet | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const wallet = useStellarWallet();
  return <WalletCtx.Provider value={wallet}>{children}</WalletCtx.Provider>;
};

export function useWallet(): StellarWallet {
  const ctx = useContext(WalletCtx);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
}
