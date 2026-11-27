"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [status, setStatus] = useState<TransactionStatus>("pending");
  const terminalHashRef = useRef<string | null>(null);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);
  useEffect(() => {
    setStatus("pending");
    terminalHashRef.current = null;
  }, [hash]);

  const check = useCallback(async () => {
    if (!hash) return;
    try {
      const res = await fetch(`/api/v1/transactions/${hash}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; errorCode?: string };
      if (data.status === "success") {
        setStatus("confirmed");
        if (terminalHashRef.current !== hash) {
          terminalHashRef.current = hash;
          onTerminalRef.current?.("confirmed");
        }
      } else if (data.status === "failed") {
        setStatus("failed");
        if (terminalHashRef.current !== hash) {
          terminalHashRef.current = hash;
          onTerminalRef.current?.("failed", data.errorCode);
        }
      }
    } catch {
      // ignore transient network errors while polling
    }
  }, [hash]);

  usePolling(check, interval);

  return status;
}
