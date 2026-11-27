'use client';

/**
 * useDialogFocus — Issue #1454
 *
 * Shared focus management for modal dialogs and drawers:
 *  1. Moves focus to the dialog heading when the dialog opens.
 *  2. Keeps Tab / Shift+Tab inside the dialog while it is open.
 *  3. Restores focus to the element that opened the dialog when it closes.
 *  4. Calls `onEscape` when Escape is pressed (without firing twice).
 *
 * The hook is deliberately independent from `focus-trap-react` so the
 * behaviour is deterministic in tests (where the library is usually mocked)
 * and consistent across every dialog implementation in the app.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Elements that a keyboard user can reach with Tab inside a dialog. */
export const FOCUSABLE_ELEMENTS_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  "input:not([disabled]):not([type='hidden'])",
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseDialogFocusOptions {
  /** Whether the dialog is currently visible. */
  isOpen: boolean;
  /** The dialog panel — focus is trapped within this element. */
  containerRef: RefObject<HTMLElement | null>;
  /** Heading that receives focus on open. Falls back to the panel. */
  headingRef?: RefObject<HTMLElement | null>;
  /** Used when no `headingRef` is supplied. Defaults to h1/h2 inside the panel. */
  headingSelector?: string;
  /** Explicit trigger (e.g. a stored button ref). Falls back to activeElement. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Called on Escape while the dialog is open. */
  onEscape?: () => void;
}

export function useDialogFocus({
  isOpen,
  containerRef,
  headingRef,
  headingSelector = 'h1, h2, [data-dialog-heading]',
  triggerRef,
  onEscape,
}: UseDialogFocusOptions): void {
  // Keep the latest callback without re-running the effect (and therefore
  // without moving focus again) on every parent re-render.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const activeElementTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    // Remember who opened the dialog. Prefer an explicit trigger ref because
    // programmatic clicks do not always move document.activeElement (jsdom).
    const active = document.activeElement;
    if (
      !triggerRef?.current &&
      active instanceof HTMLElement &&
      active !== document.body &&
      !container.contains(active)
    ) {
      activeElementTriggerRef.current = active;
    }
    const returnTo = triggerRef?.current ?? activeElementTriggerRef.current;

    // Move focus to the heading so screen readers announce its title.
    const heading =
      headingRef?.current ?? container.querySelector<HTMLElement>(headingSelector) ?? container;
    if (!heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1');
    }
    heading.focus();

    function getFocusable(): HTMLElement[] {
      return Array.from(
        container!.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)
      ).filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          !element.closest('[hidden]')
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!onEscapeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      const activeElement = document.activeElement as HTMLElement | null;

      // Focus escaped the dialog — pull it back in.
      if (!activeElement || !container!.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0])?.focus();
        return;
      }

      if (focusable.length === 0) {
        event.preventDefault();
        heading.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && (activeElement === first || activeElement === heading)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Capture phase keeps Escape from leaking to page-level shortcuts.
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (returnTo && document.contains(returnTo)) {
        returnTo.focus();
      }
      activeElementTriggerRef.current = null;
    };
  }, [isOpen, containerRef, headingRef, headingSelector, triggerRef]);
}
