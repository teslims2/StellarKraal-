/**
 * useLiveRegion — Issue #1461
 *
 * Hook that exposes `announce` and `announceAssertive` helpers so any
 * component can push messages to the global ARIA live region.
 *
 * Example:
 *   const { announce } = useLiveRegion();
 *   // After a loan status change:
 *   announce(`Loan ${loanId} is now ${newStatus}`);
 *
 * Use `announceAssertive` only for time-sensitive information (errors,
 * session warnings) that should interrupt the user's current screen-reader
 * flow.  Prefer `announce` for all other updates.
 */
import { useCallback } from "react";
import { liveRegionBus } from "@/lib/liveRegionBus";

export interface UseLiveRegionReturn {
  /** Announce a non-urgent message (aria-live="polite"). */
  announce: (message: string) => void;
  /** Announce an urgent message (aria-live="assertive"). */
  announceAssertive: (message: string) => void;
}

export function useLiveRegion(): UseLiveRegionReturn {
  const announce = useCallback((message: string) => {
    liveRegionBus.emit("polite", message);
  }, []);

  const announceAssertive = useCallback((message: string) => {
    liveRegionBus.emit("assertive", message);
  }, []);

  return { announce, announceAssertive };
}
