/**
 * useSessionTimeout — Issue #569
 *
 * Reads the JWT expiry from a "session" cookie, ticks a countdown, and
 * surfaces state that drives the SessionTimeoutBanner.
 *
 * Acceptance criteria:
 *  ✓ Banner appears when token has < 5 minutes remaining
 *  ✓ Countdown timer shows minutes and seconds remaining
 *  ✓ On expiry the hook reports `expired: true` instead of hard-redirecting,
 *    so the SessionExpiredModal can prompt a reconnect without losing the
 *    current page (Issue #1509)
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/** Milliseconds before expiry at which the warning becomes visible. */
const WARN_MS = 5 * 60 * 1000; // 5 minutes

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Window event dispatched after the session cookie has been refreshed, so every
 * mounted instance of this hook (banner, modal, wallet context) re-reads the
 * new expiry.
 */
export const SESSION_REFRESHED_EVENT = "stellarkraal:session-refreshed";

/**
 * Parses the `session` cookie and returns the JWT expiry as a Unix timestamp
 * in milliseconds, or `null` when no valid token is found.
 */
function readExpiry(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  try {
    const parts = match[1].split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload?.exp !== "number") return null;
    return payload.exp * 1000; // convert seconds → ms
  } catch {
    return null;
  }
}

export interface SessionTimeoutState {
  /** Whether the warning banner should be visible. */
  showBanner: boolean;
  /** Seconds remaining until token expiry (0 when expired). */
  secondsLeft: number;
  /** True once the token's expiry time has passed without a refresh. */
  expired: boolean;
  /**
   * Attempt a token refresh via the API (extends the session).
   * Resolves to `true` on success, `false` on failure.
   */
  refresh: () => Promise<boolean>;
  /** Whether a refresh request is in-flight. */
  refreshing: boolean;
  /** Non-null when the last refresh attempt failed. */
  refreshError: string | null;
}

export function useSessionTimeout(): SessionTimeoutState {
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read expiry on mount, and again whenever any instance refreshes the session
  useEffect(() => {
    setExpiryMs(readExpiry());
    if (typeof window === "undefined") return;
    const onRefreshed = () => {
      setExpiryMs(readExpiry());
      setNow(Date.now());
    };
    window.addEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
  }, []);

  // Tick every second while we have an unexpired expiry
  useEffect(() => {
    if (expiryMs == null) return;
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [expiryMs]);

  const refresh = useCallback(async (): Promise<boolean> => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
      // Re-read the updated cookie here and in every other mounted instance
      setExpiryMs(readExpiry());
      setNow(Date.now());
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(SESSION_REFRESHED_EVENT));
      }
      return true;
    } catch (e: unknown) {
      setRefreshError(e instanceof Error ? e.message : "Session refresh failed");
      return false;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const msLeft = expiryMs != null ? Math.max(0, expiryMs - now) : Infinity;
  const secondsLeft = Math.floor(msLeft / 1000);
  const showBanner = expiryMs != null && msLeft > 0 && msLeft <= WARN_MS;
  const expired = expiryMs != null && msLeft <= 0;

  return { showBanner, expired, secondsLeft, refresh, refreshing, refreshError };
}
