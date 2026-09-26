"use client";
import { useCallback, useEffect, useRef } from "react";
import { usePolling } from "./usePolling";

export type TransactionStatus = "pending" | "confirmed" | "failed";

interface UseTransactionStatusOptions {
  /** Poll interval in ms. @default 3000 */
  interval?: number;
  /** Called once when the transaction reaches a terminal state. */
  onTerminal?: (status: TransactionStatus, errorCode?: string) => void;
}

export function useTransactionStatus(
  hash: string | null | undefined,
  options: UseTransactionStatusOptions = {}
) {
  const { interval = 3000, onTerminal } = options;
  const statusRef = useRef<TransactionStatus>("pending");
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  const check = useCallback(async () => {
    if (!hash) return;
    try {
      const res = await fetch(`/api/v1/transactions/${hash}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; errorCode?: string };
      if (data.status === "success") {
        statusRef.current = "confirmed";
        onTerminalRef.current?.("confirmed");
      } else if (data.status === "failed") {
        statusRef.current = "failed";
        onTerminalRef.current?.("failed", data.errorCode);
      }
    } catch {
      // ignore transient network errors while polling
    }
  }, [hash]);

  usePolling(check, interval);

  return statusRef.current;
}
