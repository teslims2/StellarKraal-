"use client";
import { useState, useId, useRef } from "react";
import { usePopoverPosition } from "./Tooltip";

export interface FieldTooltipProps {
  /** The tooltip text shown on hover/focus. Written at Grade 8 reading level. */
  content: string;
  /** Optional aria-label for the trigger button (defaults to "More information"). */
  label?: string;
}

/**
 * FieldTooltip — #1095 / #833
 *
 * An info-icon button that shows a tooltip for complex form field terms
 * (LTV, health factor, origination fee, collateral value, etc.).
 *
 * Positioning & Overflow (#833):
 *  - Automatically detects viewport edges
 *  - Flips from top to bottom (or right to left) to prevent clipping
 *  - Updates caret / arrow indicator to match flipped position
 *  - Recalculates dynamically on window resize
 *
 * Accessibility:
 *  - Trigger button is keyboard-focusable
 *  - Tooltip has role="tooltip" and is referenced by aria-describedby on the trigger
 *  - Opens on hover (mouseenter/mouseleave) and keyboard focus (focus/blur)
 *  - Toggle-able via Enter or Space
 *  - Closes on Escape
 */
export default function FieldTooltip({ content, label = "More information" }: FieldTooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const { side, align } = usePopoverPosition(triggerRef, tooltipRef, visible);

  function show() {
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  function toggle() {
    setVisible((v) => !v);
  }

  const verticalClass = side === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const horizontalClass =
    align === "right"
      ? "right-0 left-auto translate-x-0"
      : align === "left"
      ? "left-0 translate-x-0"
      : "left-1/2 -translate-x-1/2";

  const arrowHorizontalClass =
    align === "right"
      ? "right-4 left-auto translate-x-0"
      : align === "left"
      ? "left-4 translate-x-0"
      : "left-1/2 -translate-x-1/2";

  const arrowVerticalClass =
    side === "bottom"
      ? "-top-2 border-b-8 border-x-8 border-t-0 border-x-transparent"
      : "-bottom-2 border-t-8 border-x-8 border-b-0 border-x-transparent";

  const arrowColorStyle =
    side === "bottom"
      ? { borderBottomColor: "#3D2810" }
      : { borderTopColor: "#3D2810" };

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            hide();
          }
        }}
        className="inline-flex items-center justify-center text-brown/50 hover:text-brown
          transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60
          focus-visible:ring-offset-1 rounded-full"
      >
        {/* Info circle icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-side={side}
          data-align={align}
          className={`absolute z-50 ${verticalClass} ${horizontalClass}
            w-56 sm:w-64 rounded-lg bg-brown-dark dark:bg-brown-900 p-3 text-sm shadow-lg
            text-white pointer-events-none`}
          style={{ backgroundColor: "#3D2810" }}
        >
          {content}
          {/* Caret / Arrow indicator (#833) */}
          <span
            aria-hidden="true"
            data-testid="tooltip-arrow"
            data-side={side}
            data-align={align}
            className={`absolute ${arrowVerticalClass} ${arrowHorizontalClass}`}
            style={arrowColorStyle}
          />
        </div>
      )}
    </span>
  );
}
