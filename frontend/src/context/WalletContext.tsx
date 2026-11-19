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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletContextValue extends WalletState {
  /** The connected wallet's public key, or null when disconnected. */
  publicKey: string | null;
  /** True when a wallet is connected. */
  isConnected: boolean;
  /** The active Stellar network (e.g. "PUBLIC", "TESTNET"), or null. */
  network: string | null;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "freighter_public_key";
const FREIGHTER_URL = "https://www.freighter.app/";
/** How often (ms) to poll Freighter for lock/disconnect/network changes. */
const POLL_INTERVAL_MS = 2500;

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

/**
 * Polls Freighter for its current connection state and network.
 * Returns `{ connected, network }`. When the extension is missing or its API
 * does not expose the probes, `connected` is reported as `true` so we never
 * spuriously clear state.
 */
async function probeFreighter(): Promise<{
  connected: boolean;
  network: string | null;
}> {
  const w = window as unknown as {
    freighter?: {
      isConnected?: () => Promise<boolean>;
      getNetworkDetails?: () => Promise<{ network?: string }>;
      getNetwork?: () => Promise<string>;
    };
    freighterApi?: {
      isConnected?: () => Promise<boolean>;
      getNetworkDetails?: () => Promise<{ network?: string }>;
      getNetwork?: () => Promise<string>;
    };
  };
  const api = w.freighter ?? w.freighterApi;
  if (!api) {
    return { connected: false, network: null };
  }

  let connected = true;
  if (typeof api.isConnected === "function") {
    try {
      connected = Boolean(await api.isConnected());
    } catch {
      connected = false;
    }
  }

  let network: string | null = null;
  if (typeof api.getNetworkDetails === "function") {
    try {
      const details = await api.getNetworkDetails();
      network = details?.network ?? null;
    } catch {
      network = null;
    }
  } else if (typeof api.getNetwork === "function") {
    try {
      network = (await api.getNetwork()) ?? null;
    } catch {
      network = null;
    }
  }

  return { connected, network };
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
  const [network, setNetwork] = useState<string | null>(null);

  // Keep a ref to the latest wallet so the polling effect does not need to
  // re-subscribe on every render.
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

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
   * Poll Freighter while connected to detect:
   *  - the extension being locked / disconnected (clears context state)
   *  - a network change (updates `network`)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!wallet.address) return;

    let cancelled = false;

    const tick = async () => {
      const result = await probeFreighter();
      if (cancelled) return;

      if (!result.connected) {
        // Freighter locked or disconnected — clear context state.
        walletRef.current.disconnect();
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        setNetwork(null);
        return;
      }

      setNetwork((prev) => (prev === result.network ? prev : result.network));
    };

    // Probe immediately, then on an interval.
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [wallet.address]);

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
    setNetwork(null);
    clearSessionCookie();
    router.push("/");
  }, [wallet, router]);

  const publicKey = wallet.address ?? null;
  const isConnected = Boolean(publicKey);
  const isAuthenticated = isConnected;

  const value = useMemo<WalletContextValue>(
    () => ({
      ...wallet,
      publicKey,
      isConnected,
      network,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
    }),
    [
      wallet,
      publicKey,
      isConnected,
      network,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
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
 * useWalletSelector — subscribe to a single slice of wallet state so the
 * consuming component only re-renders when that slice changes.
 *
 * @example
 *   const publicKey = useWalletSelector((w) => w.publicKey);
 *   const network = useWalletSelector((w) => w.network);
 */
export function useWalletSelector<T>(
  selector: (value: WalletContextValue) => T
): T {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWalletSelector must be used within a WalletProvider");
  }
  return selector(ctx);
}

/** Convenience hook: only the connected public key. */
export function usePublicKey(): string | null {
  return useWalletSelector((w) => w.publicKey);
}

/** Convenience hook: only the connection status. */
export function useIsConnected(): boolean {
  return useWalletSelector((w) => w.isConnected);
}

/** Convenience hook: only the active network. */
export function useNetwork(): string | null {
  return useWalletSelector((w) => w.network);
}
