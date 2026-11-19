"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastAction = {
  /** Optional link to the result of the action (e.g. transaction details). */
  link?: { href: string; label?: string };
  /** Optional retry callback for failed actions. */
  retry?: { onRetry: () => void; label?: string };
  /** Optional support URL shown on failures. */
  support?: { href: string; label?: string };
};

export type ToastOptions = {
  /** Short summary of the completed action (success toasts). */
  summary?: string;
  /** Human-readable error reason (failure toasts). */
  reason?: string;
  /** Optional action links/callbacks. */
  action?: ToastAction;
  /** Override the auto-dismiss timeout in milliseconds. */
  timeout?: number;
};

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  summary?: string;
  reason?: string;
  action?: ToastAction;
  timeout: number;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DISMISS_MS = 5000;
const ERROR_DISMISS_MS = 8000;

function defaultTimeoutFor(variant: ToastVariant) {
  return variant === "error" ? ERROR_DISMISS_MS : DEFAULT_DISMISS_MS;
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visibleToasts, setVisibleToasts] = useState<Toast[]>([]);
  const [queue, setQueue] = useState<Toast[]>([]);

  // Track timers by toast id so we can reliably clear.
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setVisibleToasts((prev) => prev.filter((t) => t.id !== id));
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const flushQueue = useCallback(() => {
    setQueue((prevQueue) => {
      let nextQueue = prevQueue;
      setVisibleToasts((prevVisible) => {
        const capacity = MAX_VISIBLE - prevVisible.length;
        if (capacity <= 0) return prevVisible;
        const toAdd = nextQueue.slice(0, capacity);
        nextQueue = nextQueue.slice(capacity);
        return [...prevVisible, ...toAdd];
      });
      return nextQueue;
    });
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", options: ToastOptions = {}) => {
      const id = nextId();
      const t: Toast = {
        id,
        message,
        variant,
        summary: options.summary,
        reason: options.reason,
        action: options.action,
        timeout: options.timeout ?? defaultTimeoutFor(variant),
      };

      setQueue((prev) => {
        const candidateVisible = Math.min(visibleToasts.length, MAX_VISIBLE);
        // We use visibleToasts.length from closure. To avoid race conditions,
        // enqueue and let flushQueue enforce max visible.
        return [...prev, t];
      });

      // Put immediately into visible if we have capacity.
      setVisibleToasts((prevVisible) => {
        if (prevVisible.length >= MAX_VISIBLE) return prevVisible;
        return [...prevVisible, t];
      });

      // Remove from queue if it was added there and moved into visible.
      setQueue((prev) => prev.filter((x) => x.id !== t.id));

      // Auto-dismiss.
      const timerId = window.setTimeout(() => {
        dismiss(id);
        // Make room for next queued toast.
        flushQueue();
      }, t.timeout);
      timersRef.current.set(id, timerId);

      // Ensure queue is drained if there is space.
      // (In practice, auto-dismiss and manual dismiss call flushQueue too.)
      flushQueue();
    },
    [dismiss, flushQueue, visibleToasts.length]
  );

  const success = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "success", options),
    [toast]
  );
  const error = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "error", options),
    [toast]
  );
  const warning = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "warning", options),
    [toast]
  );
  const info = useCallback(
    (message: string, options?: ToastOptions) => toast(message, "info", options),
    [toast]
  );

  const value = useMemo(
    () => ({ toast, success, error, warning, info, dismiss }),
    [toast, success, error, warning, info, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Render-time live announcements are handled by ToastViewport */}
      <ToastViewport visibleToasts={visibleToasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  visibleToasts,
  onDismiss,
}: {
  visibleToasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  // Use a polite live region. For error variant, we can make it assertive.
  const [announcement, setAnnouncement] = useState<string>("");

  useEffect(() => {
    if (visibleToasts.length === 0) return;
    // Announce the most recently added toast.
    const last = visibleToasts[visibleToasts.length - 1];
    const detail = last.reason ?? last.summary;
    setAnnouncement(`${last.variant}: ${last.message}${detail ? ` — ${detail}` : ""}`);
  }, [visibleToasts]);

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
      >
        {visibleToasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </div>
    </>
  );
}

function variantStyles(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        container: "bg-green-50 border-green-200 text-green-900",
        bar: "bg-green-500",
      };
    case "error":
      return {
        container: "bg-red-50 border-red-200 text-red-900",
        bar: "bg-red-500",
      };
    case "warning":
      return {
        container: "bg-yellow-50 border-yellow-200 text-yellow-900",
        bar: "bg-yellow-500",
      };
    case "info":
    default:
      return {
        container: "bg-blue-50 border-blue-200 text-blue-900",
        bar: "bg-blue-500",
      };
  }
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const styles = variantStyles(toast.variant);
  const isFailure = toast.variant === "error" || toast.variant === "warning";
  const detail = isFailure ? toast.reason : toast.summary;
  const action = toast.action;

  return (
    <div
      role={isFailure ? "alert" : "status"}
      aria-live="off"
      className={`border-l-4 ${styles.container} rounded-xl shadow-sm px-3 py-2 flex items-start gap-3`}
    >
      <div className={`h-full w-1 mt-1 rounded ${styles.bar}`} aria-hidden="true" />
      <div className="flex-1 text-sm leading-5">
        <div className="font-semibold capitalize">{toast.variant}</div>
        <div>{toast.message}</div>
        {detail ? <div className="mt-1 opacity-80">{detail}</div> : null}
        {action && (action.link || action.retry || action.support) ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {action.link ? (
              <a
                href={action.link.href}
                className="font-medium underline underline-offset-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold"
              >
                {action.link.label ?? "View details"}
              </a>
            ) : null}
            {action.retry ? (
              <button
                type="button"
                onClick={action.retry.onRetry}
                className="font-medium underline underline-offset-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold"
              >
                {action.retry.label ?? "Retry"}
              </button>
            ) : null}
            {action.support ? (
              <a
                href={action.support.href}
                className="font-medium underline underline-offset-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold"
              >
                {action.support.label ?? "Contact support"}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${toast.variant} notification`}
        className="ml-1 inline-flex items-center justify-center rounded-md px-2 py-1 text-current/70 hover:text-current hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

