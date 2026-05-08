/**
 * useStellarWallet — Freighter wallet integration for PayBeam.
 *
 * Wraps `@stellar/freighter-api` so the rest of the app can pretend the wallet
 * is just a connected/disconnected state machine plus a `signAndSubmit(xdr)` helper.
 */

import { useCallback, useEffect, useState } from "react";
import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  setAllowed as freighterSetAllowed,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
  getAddress as freighterGetAddress,
} from "@stellar/freighter-api";
import { STELLAR_NETWORK_PASSPHRASE } from "@/lib/configAddress";
import { submitSignedXdr } from "@/lib/stellar";

interface StellarWalletState {
  /** G... public key, or null if not connected */
  publicKey: string | null;
  isConnecting: boolean;
  isFreighterAvailable: boolean;
  error: string | null;
}

export interface StellarWallet extends StellarWalletState {
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Sign with Freighter and submit to Horizon. Returns the tx hash. */
  signAndSubmit: (unsignedXdr: string) => Promise<string>;
}

const DISCONNECTED_KEY = "paybeam:wallet:disconnected";

export function useStellarWallet(): StellarWallet {
  const [state, setState] = useState<StellarWalletState>({
    publicKey: null,
    isConnecting: false,
    isFreighterAvailable: false,
    error: null,
  });

  // Detect Freighter availability + auto-restore previous session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const conn = await freighterIsConnected();
        if (cancelled) return;
        const available = !conn.error && conn.isConnected;
        setState((s) => ({ ...s, isFreighterAvailable: !!available }));

        // Auto-reconnect if user previously authorized AND has not explicitly disconnected
        if (available && !localStorage.getItem(DISCONNECTED_KEY)) {
          const allowed = await freighterIsAllowed();
          if (!allowed.error && allowed.isAllowed) {
            const addr = await freighterGetAddress();
            if (!addr.error && addr.address) {
              setState((s) => ({ ...s, publicKey: addr.address }));
            }
          }
        }
      } catch (err) {
        console.warn("[useStellarWallet] init error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const conn = await freighterIsConnected();
      if (conn.error || !conn.isConnected) {
        const msg = "Freighter wallet not detected. Install it from freighter.app.";
        setState((s) => ({ ...s, error: msg, isConnecting: false }));
        return null;
      }

      // Request access if not already granted
      const allowed = await freighterIsAllowed();
      if (allowed.error || !allowed.isAllowed) {
        const set = await freighterSetAllowed();
        if (set.error) {
          setState((s) => ({ ...s, error: set.error, isConnecting: false }));
          return null;
        }
      }

      const addr = await freighterRequestAccess();
      if (addr.error || !addr.address) {
        setState((s) => ({
          ...s,
          error: addr.error || "Failed to read address from Freighter",
          isConnecting: false,
        }));
        return null;
      }

      localStorage.removeItem(DISCONNECTED_KEY);
      setState((s) => ({
        ...s,
        publicKey: addr.address,
        isConnecting: false,
        error: null,
      }));
      return addr.address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Wallet connect failed";
      setState((s) => ({ ...s, error: msg, isConnecting: false }));
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.setItem(DISCONNECTED_KEY, "1");
    setState((s) => ({ ...s, publicKey: null, error: null }));
  }, []);

  const signAndSubmit = useCallback(
    async (unsignedXdr: string): Promise<string> => {
      if (!state.publicKey) throw new Error("Wallet not connected");

      const signed = await freighterSignTransaction(unsignedXdr, {
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
        address: state.publicKey,
      });

      if (signed.error) {
        throw new Error(signed.error);
      }
      if (!signed.signedTxXdr) {
        throw new Error("Freighter returned no signed transaction");
      }

      return submitSignedXdr(signed.signedTxXdr);
    },
    [state.publicKey]
  );

  return {
    ...state,
    connect,
    disconnect,
    signAndSubmit,
  };
}
