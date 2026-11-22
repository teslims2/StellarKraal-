/**
 * liveRegionBus — Issue #1461
 *
 * A tiny publish/subscribe bus that decouples components from the global
 * ARIA live region.  Any component can announce a message without needing
 * a direct reference to the LiveRegion component.
 *
 * Usage:
 *   import { useLiveRegion } from "@/hooks/useLiveRegion";
 *   const { announce, announceAssertive } = useLiveRegion();
 *   announce("Loan #123 status changed to Funded");
 */

export type LiveRegionPoliteness = "polite" | "assertive";

type Listener = (message: string) => void;

class LiveRegionBus {
  private listeners: Map<LiveRegionPoliteness, Set<Listener>> = new Map([
    ["polite", new Set()],
    ["assertive", new Set()],
  ]);

  on(politeness: LiveRegionPoliteness, listener: Listener): () => void {
    this.listeners.get(politeness)!.add(listener);
    return () => this.listeners.get(politeness)!.delete(listener);
  }

  emit(politeness: LiveRegionPoliteness, message: string): void {
    this.listeners.get(politeness)?.forEach((l) => l(message));
  }
}

/** Singleton bus shared across the application. */
export const liveRegionBus = new LiveRegionBus();
