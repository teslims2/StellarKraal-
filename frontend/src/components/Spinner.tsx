/**
 * Spinner — inline indicator for an action already in progress.
 *
 * Use for: button clicks, filter changes, inline lookups, wallet connect.
 * Do NOT use for initial page/data loads — use a Skeleton component instead.
 * Do NOT use for file uploads — use ProgressBar instead.
 *
 * ## Usage hierarchy (see LoadingStates.stories.tsx)
 *  - Skeleton  → initial page/data load (no content yet)
 *  - Spinner   → inline action already in progress
 *  - ProgressBar → file / media uploads (known progress %)
 *
 * ## Accessibility
 *  - `role="status"` + `aria-label` announce the loading state to screen readers.
 *  - `aria-busy="true"` is set on the SVG element.
 *  - Colour is inherited from the parent via `currentColor` — adapts to any
 *    button or text colour in both light and dark modes.
 *
 * ## Rules
 *  - Always disable the containing control while its spinner is visible.
 *  - Pair with a progress verb in the button label ("Processing…", "Submitting…").
 *  - Never show a spinner AND a skeleton for the same region simultaneously.
 */
interface SpinnerProps {
  /** Tailwind sizing classes. Defaults to a 1 rem inline glyph. */
  className?: string;
  /** Accessible label announced to assistive tech. Defaults to "Loading". */
  label?: string;
}

export default function Spinner({ className = "h-4 w-4", label = "Loading" }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}
