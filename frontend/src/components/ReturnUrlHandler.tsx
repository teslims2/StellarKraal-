'use client';

/**
 * ReturnUrlHandler — Issue #1500.
 *
 * When the edge middleware bounces an unauthenticated user from a protected
 * route, it appends `?returnUrl=<original path>` to the redirect to `/`. This
 * component lives in the root layout and sends the user back to that
 * destination once they have successfully connected their wallet and the
 * session JWT is valid.
 *
 * Loop safety: it only navigates once the `session` cookie is valid, which is
 * the exact condition the middleware checks. Navigating before the cookie is
 * set would bounce the user straight back to `/` (a loop). The auth round-trip
 * that writes the cookie is asynchronous, so we poll briefly after the wallet
 * connects.
 *
 * Open-redirect safety: `isSafeReturnUrl` rejects external / protocol-relative
 * targets, so a crafted `returnUrl` can never leave the app.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletContext } from '@/context/WalletContext';
import { RETURN_URL_PARAM, isSafeReturnUrl, isSessionValidClient } from '@/lib/routeGuard';

export default function ReturnUrlHandler() {
  const router = useRouter();
  const { isAuthenticated } = useWalletContext();

  useEffect(() => {
    if (!isAuthenticated) return;

    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get(RETURN_URL_PARAM);
    if (!isSafeReturnUrl(returnUrl)) return;

    const navigateBack = () => router.replace(returnUrl as string);

    // Common case: the session cookie is already valid (e.g. wallet restored
    // from a previous session). Send them back immediately.
    if (isSessionValidClient()) {
      navigateBack();
      return;
    }

    // The cookie is written moments after the wallet connects (the auth
    // challenge/sign round-trip is async). Poll until it appears, then
    // navigate; give up after 15s so we never spin forever.
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (isSessionValidClient()) {
        window.clearInterval(interval);
        navigateBack();
      } else if (Date.now() - startedAt > 15_000) {
        window.clearInterval(interval);
      }
    }, 400);

    return () => window.clearInterval(interval);
  }, [isAuthenticated, router]);

  return null;
}
