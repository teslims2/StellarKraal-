/**
 * Shared route-protection helpers — Issue #1500.
 *
 * These are pure, runtime-agnostic utilities used by both the Next.js edge
 * middleware (`src/middleware.ts`) and the client-side redirect-back handler
 * (`src/components/ReturnUrlHandler.tsx`). Keeping them here avoids importing
 * `next/server` (server-only) into a client component bundle.
 */

/**
 * Query parameter carrying the path a user originally requested before being
 * bounced to `/` for authentication. The redirect-back handler reads it to
 * send them to their destination after a successful wallet connection.
 */
export const RETURN_URL_PARAM = 'returnUrl';

/**
 * A `returnUrl` is only honoured when it points at an internal app path. This
 * prevents open-redirect abuse (`returnUrl=//evil.com`, `returnUrl=https://...`,
 * or whitespace-prefixed tricks) from sending users to an attacker-controlled
 * host after they authenticate.
 *
 * @param target - The candidate return path (usually a query-string value).
 * @returns `true` when the target is a safe relative app path.
 */
export function isSafeReturnUrl(target: string | null | undefined): boolean {
  if (!target || typeof target !== 'string') return false;
  // Reject surrounding whitespace (e.g. " /dashboard").
  if (target !== target.trim()) return false;
  // Must be a relative path (no scheme/host).
  if (!target.startsWith('/')) return false;
  // Reject protocol-relative URLs ("//evil.com").
  if (target.startsWith('//')) return false;
  return true;
}

/**
 * Decode the `session` JWT cookie's payload without verifying the signature.
 * Used by the client-side redirect-back handler to decide whether the route
 * guard will admit the user before sending them back (avoids a redirect loop).
 *
 * Browser-only: returns `null` when called outside a DOM environment.
 *
 * @returns The decoded payload, or `null` when the cookie is absent/malformed.
 */
export function readSessionPayload(): Record<string, unknown> | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  try {
    const parts = match[1].split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read the `session` JWT cookie's expiry as a Unix timestamp in milliseconds,
 * or `null` when no valid token is present. Mirrors the check the edge
 * middleware performs server-side.
 */
export function readSessionExpiry(): number | null {
  const payload = readSessionPayload();
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/**
 * True when the `session` cookie holds a non-expired JWT (browser-only). The
 * redirect-back handler waits for this to become true so it never sends the
 * user to a protected route the middleware would immediately bounce back from.
 */
export function isSessionValidClient(): boolean {
  const exp = readSessionExpiry();
  return exp !== null && exp > Date.now();
}
