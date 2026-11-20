"use client";
/**
 * WalletContext — Issue #1208 / #1356
 *
 * Wraps useWallet and adds auth-aware disconnect behaviour:
 *  - Clears the `session` JWT cookie on disconnect
 *  - Redirects to `/` after disconnect
 *  - Exposes `isAuthenticated` derived from address presence
 *
 * Issue #1356 adds the Freighter connect/disconnect flow:
 *  - Detects the Freighter browser extension and exposes `isFreighterInstalled`
 *  - `connectFreighter()` requests permission and stores the public key
 *  - Connection state persists across refreshes via localStorage
 *
 * Issue #1509 adds graceful session-loss handling:
 *  - Watches for the wallet being disconnected/locked/switched externally
 *    (polling + window focus) and exposes `connectionLost`
 *  - Exposes `sessionExpired` when the session JWT passes its expiry
 *  - `reconnect()` reconnects the wallet and renews the session in place, so
 *    the user keeps their current page and any in-progress flow
 *
 * Protected pages should use this context to gate access.
 */
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useWallet, type WalletState } from "@/hooks/useWallet";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import {
  getAddress as freighterGetAddress,
  isAllowed as freighterIsAllowed,
  isConnected as freighterIsConnected,
} from "@/lib/freighterClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletContextValue extends WalletState {
  /** True when a wallet address is present (user is connected). */
  isAuthenticated: boolean;
  /** True when the Freighter browser extension is available. */
  isFreighterInstalled: boolean;
  /** True while a Freighter permission request is in flight. */
  isConnecting: boolean;
  /** Last connection error, if any. */
  connectError: string | null;
  /**
   * Request Freighter permission, retrieve the public key, and store it in
   * context (persisted to localStorage).
   */
  connectFreighter: () => Promise<void>;
  /**
   * Disconnect the wallet, clear the JWT session cookie, and redirect to `/`.
   * This is the canonical disconnect action to use throughout the app.
   */
  disconnectAndClear: () => void;
  /**
   * True when a previously connected wallet was disconnected, locked, or
   * switched to another account outside the app (Issue #1509).
   */
  connectionLost: boolean;
  /** True when the session JWT has expired without being refreshed. */
  sessionExpired: boolean;
  /** Convenience flag: the user must reconnect before continuing. */
  needsReconnect: boolean;
  /** True while `reconnect()` is in flight. */
  reconnecting: boolean;
  /** Error from the last `reconnect()` attempt, if any. */
  reconnectError: string | null;
  /**
   * Reconnect the wallet and, if the session expired, renew it — without
   * navigating away. Resolves to `true` when the user can continue.
   */
  reconnect: () => Promise<boolean>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "freighter_public_key";
const FREIGHTER_URL = "https://www.freighter.app/";
/** Route the user is sent to after an explicit disconnect. */
export const CONNECT_ROUTE = "/";
/** How often to check that the connected wallet is still available (ms). */
export const WALLET_WATCH_INTERVAL_MS = 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clears the `session` JWT cookie that the backend sets on login.
 * Works in all modern browsers — sets Max-Age=0 to immediately expire the cookie.
 */
function clearSessionCookie(): void {
  if (typeof document === "undefined") return;
  // Expire across common path/domain combinations
  document.cookie = "session=; path=/; max-age=0; SameSite=Lax";
  document.cookie = "session=; path=/; max-age=0; SameSite=Strict";
}

/** Returns true when the Freighter extension has injected its API. */
function detectFreighter(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    freighter?: unknown;
    freighterApi?: unknown;
  };
  return Boolean(w.freighter || w.freighterApi);
}

/**
 * Requests permission from Freighter and returns the active public key.
 * Supports both the legacy `window.freighter` and `window.freighterApi`
 * injection shapes used across Freighter versions.
 */
async function requestFreighterPublicKey(): Promise<string> {
  const w = window as unknown as {
    freighter?: {
      requestAccess?: () => Promise<unknown>;
      getPublicKey?: () => Promise<string>;
    };
    freighterApi?: {
      requestAccess?: () => Promise<unknown>;
      getPublicKey?: () => Promise<string>;
    };
  };
  const api = w.freighter ?? w.freighterApi;
  if (!api) {
    throw new Error("Freighter extension not detected");
  }
  if (typeof api.requestAccess === "function") {
    await api.requestAccess();
  }
  if (typeof api.getPublicKey !== "function") {
    throw new Error("Freighter API does not expose getPublicKey");
  }
  const publicKey = await api.getPublicKey();
  if (!publicKey) {
    throw new Error("Freighter did not return a public key");
  }
  return publicKey;
}

type WalletCheck = "ok" | "lost" | "unknown";

/** Reads a boolean from Freighter results that may be `boolean` or `{ key: boolean }`. */
function readFlag(result: unknown, key: string): boolean | null {
  if (typeof result === "boolean") return result;
  if (result && typeof result === "object" && key in result) {
    return Boolean((result as Record<string, unknown>)[key]);
  }
  return null;
}

/**
 * Checks whether Freighter still exposes `expected` as the active account.
 * Returns "unknown" when the extension can't be queried (transient errors),
 * so a flaky call never interrupts the user.
 */
async function checkWalletStillConnected(expected: string): Promise<WalletCheck> {
  try {
    const connected = readFlag(await freighterIsConnected(), "isConnected");
    if (connected === false) return "lost";
    const allowed = readFlag(await freighterIsAllowed(), "isAllowed");
    if (allowed === false) return "lost";
    const result = (await freighterGetAddress()) as { address?: string; error?: unknown };
    if (result?.error || !result?.address) return "lost";
    return result.address === expected ? "ok" : "lost";
  } catch {
    return "unknown";
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const router = useRouter();

  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const session = useSessionTimeout();
  const sessionExpired = session.expired;

  // ── External disconnect detection (Issue #1509) ──────────────────────────
  // Keep the latest address in a ref so the interval/focus handlers below
  // always compare against the current account.
  const addressRef = useRef<string | null>(wallet.address);
  addressRef.current = wallet.address;

  useEffect(() => {
    if (!wallet.address || typeof window === "undefined") return;
    let cancelled = false;

    const check = async () => {
      const expected = addressRef.current;
      if (!expected) return;
      const status = await checkWalletStillConnected(expected);
      if (!cancelled && status === "lost" && addressRef.current === expected) {
        setConnectionLost(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };

    const id = window.setInterval(check, WALLET_WATCH_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [wallet.address]);

  // Detect the extension on mount and restore any persisted public key.
  useEffect(() => {
    setIsFreighterInstalled(detectFreighter());

    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && !wallet.address) {
      wallet.connect(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Connect flow:
   * 1. Verify the extension is present (prompt install otherwise)
   * 2. Request permission + public key from Freighter
   * 3. Store the public key in context and localStorage
   */
  const connectFreighter = useCallback(async () => {
    setConnectError(null);

    if (!detectFreighter()) {
      setIsFreighterInstalled(false);
      setConnectError(
        `Freighter wallet not found. Install it from ${FREIGHTER_URL} and refresh.`
      );
      if (typeof window !== "undefined") {
        window.open(FREIGHTER_URL, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setIsConnecting(true);
    try {
      const publicKey = await requestFreighterPublicKey();
      wallet.connect(publicKey);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, publicKey);
      }
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect Freighter"
      );
    } finally {
      setIsConnecting(false);
    }
  }, [wallet]);

  /**
   * Full disconnect:
   * 1. Call the base `disconnect()` which clears address state + localStorage
   * 2. Remove the persisted Freighter public key
   * 3. Expire the JWT session cookie
   * 4. Redirect to home page
   */
  const disconnectAndClear = useCallback(() => {
    wallet.disconnect();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    clearSessionCookie();
    setConnectionLost(false);
    setReconnectError(null);
    router.push(CONNECT_ROUTE);
  }, [wallet, router]);

  /**
   * Reconnect flow (Issue #1509):
   * 1. Ask Freighter for access again and read the active account
   * 2. If the session JWT expired, renew it via the refresh endpoint
   * 3. Clear the lost/expired flags — the current page stays mounted
   */
  const { refresh: refreshSession } = session;
  const reconnect = useCallback(async (): Promise<boolean> => {
    setReconnecting(true);
    setReconnectError(null);
    try {
      const addr = await wallet.connect();
      if (!addr) {
        setReconnectError(
          "Couldn't reconnect to Freighter. Unlock the extension and approve access, then try again."
        );
        return false;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, addr);
      }
      if (sessionExpired) {
        const ok = await refreshSession();
        if (!ok) {
          setReconnectError(
            "Your wallet is reconnected, but the session couldn't be renewed. Disconnect and sign in again."
          );
          return false;
        }
      }
      setConnectionLost(false);
      return true;
    } finally {
      setReconnecting(false);
    }
  }, [wallet, sessionExpired, refreshSession]);

  const isAuthenticated = Boolean(wallet.address);
  const needsReconnect = connectionLost || sessionExpired;

  const value = useMemo<WalletContextValue>(
    () => ({
      ...wallet,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
      connectionLost,
      sessionExpired,
      needsReconnect,
      reconnecting,
      reconnectError,
      reconnect,
    }),
    [
      wallet,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
      connectionLost,
      sessionExpired,
      needsReconnect,
      reconnecting,
      reconnectError,
      reconnect,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useWalletContext — use this in components that need the full auth-aware
 * wallet state (isAuthenticated, disconnectAndClear).
 *
 * Falls back gracefully when used outside the WalletProvider (returns null
 * for isAuthenticated, noop for disconnectAndClear) so existing code that
 * only consumes `useWallet()` keeps working.
 */
export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return ctx;
}

/**
 * Like {@link useWalletContext} but returns `null` outside a WalletProvider.
 * Use in shared components (Navbar, LoanWizard) that may be rendered in
 * isolation, e.g. in tests or Storybook.
 */
export function useOptionalWalletContext(): WalletContextValue | null {
  return useContext(WalletContext);
}
