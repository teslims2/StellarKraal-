'use client';

/**
 * RouteFocusManager — Issue #1454
 *
 * Keeps keyboard focus context when a client-side route transition happens:
 * focus moves to the new page's <h1>, or to <main id="main-content"> when the
 * page has no heading. Rendered once in the root layout so every route is
 * covered without touching individual pages.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Prefer the page heading; fall back to a nested main landmark, then the root one. */
export const ROUTE_FOCUS_HEADING_SELECTOR = 'h1, [data-route-heading]';
export const ROUTE_FOCUS_MAIN_SELECTOR = "main, [role='main']";

export default function RouteFocusManager() {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    const pathnameChanged = previousPathnameRef.current !== pathname;
    previousPathnameRef.current = pathname;

    // Never steal focus from an open modal or drawer.
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

    // On a route change always move focus. On the initial load only take over
    // when nothing else is focused, so autofocus fields and skip links win.
    const activeElement = document.activeElement;
    if (!pathnameChanged && activeElement && activeElement !== document.body) return;

    const main = document.getElementById('main-content');
    // querySelector returns document order, not selector order — query the
    // heading separately so it wins over a nested <main> wrapper.
    const heading = main?.querySelector<HTMLElement>(ROUTE_FOCUS_HEADING_SELECTOR);
    const mainTarget = main?.querySelector<HTMLElement>(ROUTE_FOCUS_MAIN_SELECTOR) ?? main;
    const target = heading ?? mainTarget;
    if (!target) return;

    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
