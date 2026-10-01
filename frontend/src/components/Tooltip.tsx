"use client";

/**
 * Tooltip — #557 / #833
 *
 * A keyboard-accessible tooltip that shows on hover OR focus, and hides on
 * blur or Escape. Automatically repositions (flips vertically and horizontally)
 * when the tooltip would overflow the viewport, updating its arrow indicator
 * and recalculating on window resize.
 *
 * Usage (info icon variant for form fields):
 * ```tsx
 * <FieldTooltip hint="The amount you want to borrow..." />
 * ```
 *
 * Usage (wrapping an arbitrary element):
 * ```tsx
 * <Tooltip hint="Press B to borrow">
 *   <button>Borrow</button>
 * </Tooltip>
 * ```
 */

import { ReactNode, useRef, useState, useCallback, useEffect, useId } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TooltipProps {
  /** Tooltip text */
  hint: string;
  /** The element that triggers the tooltip */
  children: ReactNode;
}

export interface FieldTooltipProps {
  /** Tooltip text sourced from WIZARD_FIELD_TOOLTIPS constants */
  hint: string;
  /** Additional class names for the trigger button */
  className?: string;
}

// ── Helper: viewport overflow guard (#833) ──────────────────────────────────

export type PopoverSide = "top" | "bottom";
export type PopoverAlign = "center" | "left" | "right";

export interface PopoverPosition {
  side: PopoverSide;
  align: PopoverAlign;
}

export function usePopoverPosition(
  triggerRef: React.RefObject<HTMLElement | null>,
  tooltipRef: React.RefObject<HTMLElement | null>,
  isVisible: boolean
): PopoverPosition {
  const [position, setPosition] = useState<PopoverPosition>({
    side: "top",
    align: "center",
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();

    const tooltipHeight = tooltipRect?.height || 60;
    const tooltipWidth = tooltipRect?.width || 256;

    // Viewport bounds
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 768;

    // Vertical overflow check (#833):
    // If less than 80px or tooltipHeight + padding above trigger, and more space below, flip to bottom
    const spaceAbove = triggerRect.top;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    let side: PopoverSide = "top";
    if (spaceAbove < tooltipHeight + 10 || spaceAbove < 80) {
      if (spaceBelow >= tooltipHeight + 10 || spaceBelow > spaceAbove) {
        side = "bottom";
      }
    }

    // Horizontal overflow check (#833):
    // By default, tooltip centers horizontally on the trigger.
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const expectedLeft = triggerCenterX - tooltipWidth / 2;
    const expectedRight = triggerCenterX + tooltipWidth / 2;

    let align: PopoverAlign = "center";
    if (expectedRight > viewportWidth - 10) {
      // Overflows right edge -> flip to right-aligned
      align = "right";
    } else if (expectedLeft < 10) {
      // Overflows left edge -> flip to left-aligned
      align = "left";
    }

    setPosition({ side, align });
  }, [triggerRef, tooltipRef]);

  useEffect(() => {
    if (!isVisible) return;

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [isVisible, updatePosition]);

  return position;
}

/** Backward-compatible hook wrapper for legacy callers */
export function usePopoverSide(
  triggerRef: React.RefObject<HTMLElement | null>,
  isVisible: boolean
): PopoverSide {
  const dummyTooltipRef = useRef<HTMLElement | null>(null);
  const { side } = usePopoverPosition(triggerRef, dummyTooltipRef, isVisible);
  return side;
}

// ── Tooltip (wrapping variant) ───────────────────────────────────────────────

/**
 * Wraps a child element and shows a tooltip on hover/focus.
 * Supports keyboard access (show on focus, hide on blur/Escape).
 * Repositions automatically when near viewport boundaries with matching arrow.
 */
export default function Tooltip({ hint, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const { side, align } = usePopoverPosition(triggerRef, tooltipRef, visible);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setVisible(false);
  }, []);

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
      ? "-top-1.5 border-b-6 border-x-6 border-t-0 border-x-transparent"
      : "-bottom-1.5 border-t-6 border-x-6 border-b-0 border-x-transparent";

  const arrowStyle =
    side === "bottom"
      ? { borderBottomColor: "var(--token-text, #1F2937)" }
      : { borderTopColor: "var(--token-text, #1F2937)" };

  return (
    <span
      ref={triggerRef}
      className="relative group inline-flex w-full"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      {children}
      {visible && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-side={side}
          data-align={align}
          className={`
            pointer-events-none absolute z-50
            max-w-xs w-max whitespace-normal break-words
            bg-[color:var(--token-text)] text-[color:var(--token-text-inverse)]
            text-xs px-2.5 py-1.5 rounded-md shadow-lg
            ${verticalClass} ${horizontalClass}
          `}
        >
          {hint}
          {/* Arrow indicator matching flipped position (#833) */}
          <span
            aria-hidden="true"
            data-testid="tooltip-arrow"
            data-side={side}
            data-align={align}
            className={`
              absolute pointer-events-none w-0 h-0 border-solid
              ${arrowVerticalClass} ${arrowHorizontalClass}
            `}
            style={arrowStyle}
          />
        </span>
      )}
    </span>
  );
}

// ── FieldTooltip (info-icon variant for form fields) ─────────────────────────

/**
 * A standalone ⓘ info icon that shows a tooltip on hover/focus.
 * Intended for use next to form field labels in LoanWizard.
 * Dynamically repositions to avoid viewport overflow (#833).
 */
export function FieldTooltip({ hint, className = "" }: FieldTooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const { side, align } = usePopoverPosition(triggerRef, tooltipRef, visible);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setVisible(false);
      triggerRef.current?.blur();
    }
  }, []);

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
      ? "-top-1.5 border-b-6 border-x-6 border-t-0 border-x-transparent"
      : "-bottom-1.5 border-t-6 border-x-6 border-b-0 border-x-transparent";

  const arrowStyle =
    side === "bottom"
      ? { borderBottomColor: "var(--token-text, #1F2937)" }
      : { borderTopColor: "var(--token-text, #1F2937)" };

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More information"
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleKeyDown}
        className={`
          ml-1 inline-flex items-center justify-center
          w-4 h-4 rounded-full text-[10px] font-bold
          bg-color-primary/15 text-color-primary
          hover:bg-color-primary/25 focus:bg-color-primary/25
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-color-primary focus-visible:ring-offset-1
          cursor-help transition-colors
          ${className}
        `}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>

      {visible && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-side={side}
          data-align={align}
          className={`
            pointer-events-none absolute z-50
            max-w-xs w-64 whitespace-normal break-words
            bg-[color:var(--token-text)] text-[color:var(--token-text-inverse)]
            text-xs px-3 py-2 rounded-md shadow-lg leading-relaxed
            ${verticalClass} ${horizontalClass}
          `}
        >
          {hint}
          {/* Arrow indicator matching flipped position (#833) */}
          <span
            aria-hidden="true"
            data-testid="tooltip-arrow"
            data-side={side}
            data-align={align}
            className={`
              absolute pointer-events-none w-0 h-0 border-solid
              ${arrowVerticalClass} ${arrowHorizontalClass}
            `}
            style={arrowStyle}
          />
        </span>
      )}
    </span>
  );
}
