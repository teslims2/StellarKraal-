"use client";
/**
 * LiveRegion — Issue #1461
 *
 * A global ARIA live region that screen readers poll for dynamic content
 * updates (loan status changes, notifications, errors).  Components write
 * announcements via the `useLiveRegion` hook; this component renders the
 * hidden region that the browser surfaces to assistive technology.
 *
 * Two regions are rendered:
 *  - `aria-live="polite"`   – non-urgent updates (loan state change, success).
 *  - `aria-live="assertive"` – urgent alerts (errors, session timeout).
 *
 * The regions are visually hidden but remain in the accessibility tree so
 * that NVDA, JAWS, and VoiceOver announce their content automatically.
 */
import { useEffect, useState } from "react";
import { liveRegionBus } from "@/lib/liveRegionBus";

export type LiveRegionPoliteness = "polite" | "assertive";

/** Visually-hidden CSS — keeps the region in the a11y tree without layout impact. */
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

export default function LiveRegion() {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  useEffect(() => {
    const unsubPolite = liveRegionBus.on("polite", (msg) => {
      // Clear first so re-announcing the same string still triggers the AT
      setPoliteMessage("");
      requestAnimationFrame(() => setPoliteMessage(msg));
    });

    const unsubAssertive = liveRegionBus.on("assertive", (msg) => {
      setAssertiveMessage("");
      requestAnimationFrame(() => setAssertiveMessage(msg));
    });

    return () => {
      unsubPolite();
      unsubAssertive();
    };
  }, []);

  return (
    <>
      {/* Polite: loan status changes, notifications, success messages */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={visuallyHidden}
        data-testid="live-region-polite"
      >
        {politeMessage}
      </div>

      {/* Assertive: errors, session warnings, urgent alerts */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={visuallyHidden}
        data-testid="live-region-assertive"
      >
        {assertiveMessage}
      </div>
    </>
  );
}
