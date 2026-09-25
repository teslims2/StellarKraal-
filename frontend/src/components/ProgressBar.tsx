"use client";

/**
 * ProgressBar — deterministic progress indicator for file / media uploads.
 *
 * Use ONLY when you have a known percentage (e.g. from XMLHttpRequest or
 * fetch with a ReadableStream body reader). For indeterminate waits, use
 * Spinner instead.
 *
 * ## Loading state hierarchy (see LoadingStates.stories.tsx)
 *  - Skeleton    → initial page/data load (no content yet)
 *  - Spinner     → inline action already in progress (indeterminate)
 *  - ProgressBar → file / media upload with a known progress percentage
 *
 * ## Accessibility
 *  - Uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`,
 *    `aria-valuemax`, and `aria-label` per WAI-ARIA 1.2.
 *  - The track is visible by default; the fill colour uses the primary token
 *    so it respects both light and dark mode.
 *  - When `value` reaches 100, the label is automatically updated to convey
 *    completion to screen readers via the `aria-label` prop.
 *
 * ## Rules
 *  - Always show alongside the filename or subject being uploaded.
 *  - Disable cancel/submit controls while upload is in progress.
 *  - Set `value` to 0 when starting; remove or hide when complete.
 */

interface ProgressBarProps {
  /** Upload progress 0–100. */
  value: number;
  /** Accessible label for screen readers, e.g. "Uploading document.pdf". */
  label?: string;
  /** Optional Tailwind classes for the outer container. */
  className?: string;
}

export default function ProgressBar({
  value,
  label = "Uploading",
  className = "",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const isComplete = clamped >= 100;

  return (
    <div
      className={`w-full ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={isComplete ? `${label} — complete` : `${label} — ${clamped}%`}
      aria-busy={!isComplete}
    >
      {/* Track */}
      <div className="h-2 w-full rounded-full bg-color-border overflow-hidden">
        {/* Fill */}
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${clamped}%`,
            backgroundColor: isComplete
              ? "var(--token-success)"
              : "var(--token-primary)",
          }}
        />
      </div>
    </div>
  );
}
