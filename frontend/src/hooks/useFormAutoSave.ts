import { useEffect, useRef, useState } from 'react';

interface AutoSaveOptions<T> {
  storageKey: string;
  data: T;
  enabled?: boolean;
  interval?: number;
  /**
   * @deprecated walletAddress is no longer written to storage or used for
   * draft isolation. All drafts share the same sessionStorage key. Passing
   * this option has no effect; callers that relied on per-wallet isolation
   * must either namespace `storageKey` themselves or remove this option.
   */
  walletAddress?: string;
  /**
   * Saved data older than this (ms) is treated as if it were never saved:
   * it's discarded from sessionStorage and neither `hasSavedData` nor
   * `restoreSavedData()` will surface it. Defaults to 3_600_000 ms (1 hour).
   */
  expiryMs?: number;
}

interface SavedData<T> {
  data: T;
  /** Unix timestamp (ms) after which the draft is considered stale. */
  expiresAt: number;
}

/** How long after the last data change before showing the indicator (ms). */
const DRAFT_SAVED_DEBOUNCE_MS = 1000;

/** How long the indicator stays visible before fading out (ms). */
const DRAFT_SAVED_VISIBLE_MS = 3000;

/** Default TTL: 1 hour in ms. */
const DEFAULT_EXPIRY_MS = 3_600_000;

function isExpired(parsed: { expiresAt?: number }, expiryMs?: number): boolean {
  // If no expiryMs supplied, treat default as 1 hour
  const ttl = expiryMs ?? DEFAULT_EXPIRY_MS;
  if (!ttl) return false;
  const expiresAt = parsed.expiresAt;
  if (expiresAt === undefined || typeof expiresAt !== 'number' || isNaN(expiresAt)) return true;
  return Date.now() > expiresAt;
}

export function useFormAutoSave<T extends object>({
  storageKey,
  data,
  enabled = true,
  interval = 5000,
  walletAddress,
  expiryMs = DEFAULT_EXPIRY_MS,
}: AutoSaveOptions<T>) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasSavedData, setHasSavedData] = useState(false);
  /** True while the "Draft saved" indicator should be visible. */
  const [draftSaved, setDraftSaved] = useState(false);

  // Ref to hold the debounce timer ID so we can cancel it on re-runs.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for saved data on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed: SavedData<T> = JSON.parse(saved);
        if (isExpired(parsed, expiryMs)) {
          sessionStorage.removeItem(storageKey);
        } else {
          setHasSavedData(true);
        }
      } catch {
        // Invalid saved data — ignore
      }
    }
  }, [storageKey, expiryMs]);

  // Auto-save on interval
  useEffect(() => {
    if (!enabled) return;

    const hasData = Object.values(data).some((value) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return true;
      return Boolean(value);
    });

    if (!hasData) return;

    const interval_id = setInterval(() => {
      const saveData: SavedData<T> = {
        data,
        expiresAt: Date.now() + expiryMs,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(saveData));
      setLastSaved(new Date());
    }, interval);

    return () => clearInterval(interval_id);
  }, [data, enabled, interval, storageKey, expiryMs]);

  // Debounced "Draft saved" indicator —
  // shows 1 s after the last change to `data`.
  useEffect(() => {
    if (!enabled) return;

    const hasData = Object.values(data).some((value) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return true;
      return Boolean(value);
    });

    if (!hasData) return;

    // Cancel any pending debounce from a previous render
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDraftSaved(true);
      debounceTimerRef.current = null;
    }, DRAFT_SAVED_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [data, enabled]);

  // Fade-out timer — fires 3 s after the indicator becomes visible.
  useEffect(() => {
    if (!draftSaved) return;

    const fadeId = setTimeout(() => {
      setDraftSaved(false);
    }, DRAFT_SAVED_VISIBLE_MS);

    return () => clearTimeout(fadeId);
  }, [draftSaved]);

  const restoreSavedData = (): T | null => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return null;

    try {
      const parsed: SavedData<T> = JSON.parse(saved);
      if (isExpired(parsed, expiryMs)) {
        sessionStorage.removeItem(storageKey);
        setHasSavedData(false);
        return null;
      }
      setHasSavedData(false);
      return parsed.data;
    } catch {
      return null;
    }
  };

  const clearSavedData = () => {
    sessionStorage.removeItem(storageKey);
    setHasSavedData(false);
    setLastSaved(null);
    setDraftSaved(false);
  };

  return {
    lastSaved,
    hasSavedData,
    draftSaved,
    restoreSavedData,
    clearSavedData,
  };
}
