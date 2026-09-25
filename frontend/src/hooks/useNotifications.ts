"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "./usePolling";

export type LoanNotificationEvent =
  | "loan_approved"
  | "loan_at_risk"
  | "loan_liquidated"
  | "loan_repaid";

export interface LoanNotification {
  id: string;
  event: LoanNotificationEvent;
  loanId: string;
  message: string;
  timestamp: number;
  read: boolean;
}

/** Maps raw backend event strings to our canonical event type. */
function normalizeEvent(raw: string): LoanNotificationEvent | null {
  const map: Record<string, LoanNotificationEvent> = {
    loan_approved:   "loan_approved",
    approved:        "loan_approved",
    loan_at_risk:    "loan_at_risk",
    at_risk:         "loan_at_risk",
    loan_liquidated: "loan_liquidated",
    liquidated:      "loan_liquidated",
    loan_repaid:     "loan_repaid",
    repaid:          "loan_repaid",
  };
  return map[raw.toLowerCase()] ?? null;
}

/** Human-readable message for each event type. */
function buildMessage(event: LoanNotificationEvent, loanId: string): string {
  switch (event) {
    case "loan_approved":
      return `Loan #${loanId} has been approved and is now active.`;
    case "loan_at_risk":
      return `Loan #${loanId} is at risk — health factor is below threshold.`;
    case "loan_liquidated":
      return `Loan #${loanId} has been liquidated.`;
    case "loan_repaid":
      return `Loan #${loanId} has been fully repaid.`;
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const STORAGE_KEY = "stellarkraal_notifications";
const POLLING_INTERVAL = 30_000; // 30 seconds

/** Persist notifications to localStorage. */
function persist(notifications: LoanNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 100)));
  } catch {
    // Storage might be unavailable (SSR, private mode, quota exceeded)
  }
}

/** Load notifications from localStorage. */
function load(): LoanNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LoanNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * useNotifications — manages in-app loan status notifications (#1066).
 *
 * Strategy:
 * 1. On mount, try to open an SSE connection to `GET /api/v1/notifications/stream`.
 *    If that endpoint doesn't exist or the connection errors, fall back silently to polling.
 * 2. Polling hits `GET /api/v1/notifications` every 30 s and merges new items.
 * 3. Notifications are persisted to localStorage so they survive page reloads.
 * 4. Exposes `markRead`, `markAllRead`, and `dismiss` actions.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<LoanNotification[]>([]);
  const [sseActive, setSseActive] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setNotifications(load());
  }, []);

  // Merge incoming notifications, deduplicating by id
  const addNotifications = useCallback((incoming: LoanNotification[]) => {
    setNotifications((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const fresh = incoming.filter((n) => !existingIds.has(n.id));
      if (fresh.length === 0) return prev;
      const next = [...fresh, ...prev].slice(0, 100);
      persist(next);
      return next;
    });
  }, []);

  // Parse a raw notification payload from the API
  const parsePayload = useCallback(
    (raw: unknown): LoanNotification | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const event = normalizeEvent(String(r.event ?? r.type ?? ""));
      if (!event) return null;
      const loanId = String(r.loan_id ?? r.loanId ?? "");
      const id = String(r.id ?? `${event}-${loanId}-${Date.now()}`);
      return {
        id,
        event,
        loanId,
        message: String(r.message ?? buildMessage(event, loanId)),
        timestamp: typeof r.timestamp === "number" ? r.timestamp : Date.now(),
        read: false,
      };
    },
    [],
  );

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) return;

    const es = new EventSource(`${API}/api/v1/notifications/stream`, {
      withCredentials: false,
    });
    sseRef.current = es;

    es.addEventListener("open", () => setSseActive(true));

    es.addEventListener("loan_update", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as unknown;
        const n = parsePayload(data);
        if (n) addNotifications([n]);
      } catch {
        // Malformed payload — ignore
      }
    });

    // Generic "message" fallback
    es.addEventListener("message", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as unknown;
        const n = parsePayload(data);
        if (n) addNotifications([n]);
      } catch {
        // Ignore
      }
    });

    es.addEventListener("error", () => {
      setSseActive(false);
      es.close();
      sseRef.current = null;
    });

    return () => {
      es.close();
      sseRef.current = null;
      setSseActive(false);
    };
  }, [addNotifications, parsePayload]);

  // ── Polling fallback ────────────────────────────────────────────────────────
  // Always poll — the server may not emit every update via SSE (e.g. server
  // restarts, load-balancers that strip keep-alive). Polling acts as a safety
  // net to catch missed events.
  const poll = useCallback(() => {
    fetch(`${API}/api/v1/notifications`)
      .then((r) => {
        if (!r.ok) return;
        return r.json() as Promise<unknown>;
      })
      .then((body) => {
        const items = Array.isArray(body)
          ? body
          : Array.isArray((body as Record<string, unknown>)?.data)
          ? ((body as Record<string, unknown>).data as unknown[])
          : [];
        const parsed = items
          .map((item) => parsePayload(item))
          .filter((n): n is LoanNotification => n !== null);
        if (parsed.length) addNotifications(parsed);
      })
      .catch(() => {
        // Network failure — silently skip
      });
  }, [parsePayload, addNotifications]);

  usePolling(poll, POLLING_INTERVAL);

  // ── Actions ────────────────────────────────────────────────────────────────

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      persist(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(next);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
    persist([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    sseActive,
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  };
}
